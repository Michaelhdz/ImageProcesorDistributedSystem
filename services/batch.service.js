'use strict';
require('dotenv').config();
const Bull          = require('bull');
const archiver      = require('archiver');
const BdApiClient   = require('./bd.api.client');
const NodeManager   = require('./node.manager');
const IBatchService = require('../interfaces/IBatchService');

const MAX_ATTEMPTS = parseInt(process.env.QUEUE_MAX_ATTEMPTS || '3');
const BACKOFF_DELAY = parseInt(process.env.QUEUE_BACKOFF_DELAY || '2000');

// ── Cola de trabajos ──────────────────────────────────────────────────────────
const jobQueue = new Bull('image-processing', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

// ── Procesador de la cola ─────────────────────────────────────────────────────
jobQueue.process(async (job) => {
  const { imageJobId, nodeId, jobId, imageId, transformations } = job.data;
  console.log(`[Queue] Procesando job ${job.id} — imageJobId=${imageJobId} | nodo=${nodeId}`);

  const nodeEntry = NodeManager.grpcClients.get(nodeId);
  if (!nodeEntry) {
    throw new Error(`Nodo ${nodeId} no tiene cliente gRPC activo`);
  }

  // Marcar como PROCESSING en BD
  await BdApiClient.patch(`/image-jobs/${imageJobId}`, {
    status:  'PROCESSING',
    node_id: nodeId
  });

  // Construir lista de transformaciones para gRPC
  const grpcTransformations = transformations.map(t => ({
    type:       t.type,
    params:     JSON.stringify(t.params || {}),
    exec_order: t.exec_order
  }));

  // Despachar procesamiento al nodo
  const response = await NodeManager.dispatchProcessing(
    nodeEntry, jobId, imageId, grpcTransformations
  );

  if (!response.success) {
    await BdApiClient.patch(`/image-jobs/${imageJobId}`, {
      status:        'FAILED',
      error_message: response.error_message
    });
    await BdApiClient.post('/logs', {
      image_job_id: imageJobId,
      node_id:      nodeId,
      level:        'ERROR',
      message:      `Procesamiento fallido: ${response.error_message}`
    });
    throw new Error(response.error_message);
  }

  // Actualizar resultado en BD
  await BdApiClient.patch(`/image-jobs/${imageJobId}`, {
    status:            'COMPLETED',
    local_result_path: response.local_result_path,
    converted_at:      new Date().toISOString()
  });

  // Log de éxito
  await BdApiClient.post('/logs', {
    image_job_id:        imageJobId,
    node_id:             nodeId,
    level:               'INFO',
    transformation_type: null,
    message:             `Procesamiento completado en ${response.duration_ms}ms`,
    context: {
      duration_ms:       response.duration_ms,
      local_result_path: response.local_result_path
    }
  });

  // Actualizar contador del batch
  const imageJob = await BdApiClient.get(`/image-jobs/${imageJobId}`);
  const allJobs  = await BdApiClient.get(`/image-jobs?batchId=${imageJob.batch_id}`);
  const completed = allJobs.filter(j => j.status === 'COMPLETED').length;

  await BdApiClient.patch(`/batches/${imageJob.batch_id}`, {
    processed_images: completed
  });

  const batch = await BdApiClient.get(`/batches/${imageJob.batch_id}`);
  if (completed >= batch.total_images) {
    await BdApiClient.patch(`/batches/${imageJob.batch_id}`, {
      status:       'COMPLETED',
      completed_at: new Date().toISOString()
    });
    console.log(`[Queue] Batch ${imageJob.batch_id} completado — ${completed}/${batch.total_images} imágenes`);
  } else {
    console.log(`[Queue] Batch ${imageJob.batch_id} progreso: ${completed}/${batch.total_images}`);
  }
});

jobQueue.on('failed', (job, err) => {
  console.error(`[Queue] Job ${job.id} fallido definitivamente: ${err.message}`);
});

jobQueue.on('stalled', (job) => {
  console.warn(`[Queue] Job ${job.id} estancado — será reintentado`);
});

// ── BatchService ─────────────────────────────────────────────────────────────
class BatchService extends IBatchService {

  async createBatch(userId, files, metadata) {
    console.log(`[BatchService] Creando batch — userId=${userId} | ${files.length} imágenes`);

    const batch = await BdApiClient.post('/batches', {
      user_id:      userId,
      total_images: files.length
    });
    console.log(`[BatchService] Batch registrado en BD — batchId=${batch.id}`);

    for (const file of files) {
      const meta = metadata.find(m => m.filename === file.originalname) || {
        filename: file.originalname, transformations: []
      };

      // Seleccionar nodo con menor carga
      const nodeEntry = await NodeManager.selectNode();

      // Registrar trabajo en BD con ruta provisional
      const imageJob = await BdApiClient.post('/image-jobs', {
        batch_id:          batch.id,
        original_filename: file.originalname,
        local_input_path:  `provisional_${nodeEntry.nodeId}_${file.originalname}`
      });
      console.log(`[BatchService] ImageJob registrado — id=${imageJob.id} | filename=${file.originalname}`);

      // Registrar transformaciones en BD
      if (meta.transformations?.length > 0) {
        await BdApiClient.post('/transformations',
          meta.transformations.map(t => ({
            image_job_id: imageJob.id,
            type:         t.type,
            params:       t.params || {},
            exec_order:   t.exec_order
          }))
        );
        console.log(`[BatchService] ${meta.transformations.length} transformaciones registradas para imageJob=${imageJob.id}`);
      }

      // Subir imagen al nodo vía gRPC client streaming
      const uploadResponse = await NodeManager.uploadImageToNode(
        nodeEntry,
        file.buffer,
        imageJob.id,
        file.originalname
      );
      console.log('[DEBUG] Respuesta exacta del nodo:', JSON.stringify(uploadResponse));

      const realPath = uploadResponse.local_input_path || uploadResponse.localInputPath;

      if (!realPath) {
          console.error('[ERROR] El nodo no devolvió ninguna ruta. Respuesta:', uploadResponse);
          throw new Error('El nodo de procesamiento no devolvió la ruta del archivo.');
      }

      await BdApiClient.patch(`/image-jobs/${imageJob.id}`, {
        local_input_path: realPath
      });

      // Registrar log de subida
      await BdApiClient.post('/logs', {
        image_job_id: imageJob.id,
        node_id:      nodeEntry.nodeId,
        level:        'INFO',
        message:      `Imagen subida al nodo ${nodeEntry.nodeId} — ruta: ${uploadResponse.local_input_path}`
      });

      // Encolar trabajo de procesamiento
      await jobQueue.add(
        {
          imageJobId:      imageJob.id,
          nodeId:          nodeEntry.nodeId,
          jobId:           imageJob.id,
          imageId:         imageJob.id,
          transformations: meta.transformations || []
        },
        {
          attempts: MAX_ATTEMPTS,
          backoff:  { type: 'exponential', delay: BACKOFF_DELAY },
          removeOnComplete: true,
          removeOnFail:     false
        }
      );
      console.log(`[BatchService] Trabajo encolado — imageJobId=${imageJob.id}`);
    }

    console.log(`[BatchService] Batch ${batch.id} creado — ${files.length} trabajos encolados`);
    return batch;
  }

  async getBatchStatus(batchId, userId) {
    const batch = await BdApiClient.get(`/batches/${batchId}`).catch(() => null);
    if (!batch || batch.user_id !== userId) {
      console.warn(`[BatchService] getBatchStatus: batch ${batchId} no encontrado o no pertenece al usuario ${userId}`);
      return null;
    }
    const jobs = await BdApiClient.get(`/image-jobs?batchId=${batchId}`).catch(() => []);
    return { ...batch, jobs };
  }

  async getHistory(userId, page, limit) {
    console.log(`[BatchService] getHistory — userId=${userId} | page=${page} | limit=${limit}`);
    return BdApiClient.get(`/batches?userId=${userId}&page=${page}&limit=${limit}`);
  }

  async streamImageToClient(imageId, userId, res) {
    console.log(`[BatchService] streamImageToClient — imageId=${imageId}`);

    const job = await BdApiClient.get(`/image-jobs/${imageId}`).catch(() => null);
    if (!job) {
      const e  = new Error('Imagen no encontrada');
      e.code   = 'NOT_FOUND';
      throw e;
    }
    if (job.status !== 'COMPLETED') {
      const e  = new Error(`Imagen no disponible aún (estado: ${job.status})`);
      e.code   = 'NOT_READY';
      throw e;
    }

    const nodeEntry = NodeManager.grpcClients.get(job.node_id);
    if (!nodeEntry) {
      const e  = new Error(`Nodo ${job.node_id} no disponible`);
      e.code   = 'NODE_UNAVAILABLE';
      throw e;
    }

    const ext = job.original_filename.split('.').pop() || 'jpg';
    res.setHeader('Content-Type', `image/${ext}`);
    res.setHeader('Content-Disposition',
      `attachment; filename="${job.original_filename}"`);

    const stream = NodeManager.downloadImageFromNode(nodeEntry, imageId);
    let totalBytes = 0;

    stream.on('data', (chunk) => {
      if (chunk.chunk_data?.length > 0) {
        res.write(Buffer.from(chunk.chunk_data));
        totalBytes += chunk.chunk_data.length;
      }
    });

    stream.on('end', () => {
      console.log(`[BatchService] streamImageToClient completado — imageId=${imageId} | ${totalBytes} bytes enviados`);
      res.end();
    });

    stream.on('error', (err) => {
      console.error(`[BatchService] Error en stream de imagen ${imageId}: ${err.message}`);
      if (!res.headersSent) res.destroy();
    });
  }

  async streamBatchZipToClient(batchId, userId, res) {
    console.log(`[BatchService] streamBatchZipToClient — batchId=${batchId} | userId=${userId}`);

    const batch = await BdApiClient.get(`/batches/${batchId}`).catch(() => null);
    if (!batch || batch.user_id !== userId) {
      const e  = new Error('Lote no encontrado');
      e.code   = 'NOT_FOUND';
      throw e;
    }
    if (batch.status !== 'COMPLETED') {
      const e  = new Error(`Lote no completado aún (estado: ${batch.status})`);
      e.code   = 'NOT_READY';
      throw e;
    }

    const jobs         = await BdApiClient.get(`/image-jobs?batchId=${batchId}`);
    const completedJobs = jobs.filter(j => j.status === 'COMPLETED');

    if (completedJobs.length === 0) {
      const e  = new Error('No hay imágenes procesadas en este lote');
      e.code   = 'NOT_READY';
      throw e;
    }

    // Agrupar por nodo para el fan-out
    const jobsByNodeId = {};
    for (const job of completedJobs) {
      if (!jobsByNodeId[job.node_id]) jobsByNodeId[job.node_id] = [];
      jobsByNodeId[job.node_id].push(job);
    }

    const nodeCount = Object.keys(jobsByNodeId).length;
    console.log(`[BatchService] Fan-out a ${nodeCount} nodo(s) — ${completedJobs.length} imágenes en total`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="batch_${batchId}.zip"`);

    const archive = archiver('zip', {
      zlib:        { level: 6 },
      forceZip64:  true
    });

    archive.on('error', (err) => {
      console.error(`[BatchService] Error en archiver: ${err.message}`);
    });

    archive.on('finish', () => {
      console.log(`[BatchService] ZIP completado — batch ${batchId} | ${archive.pointer()} bytes`);
    });

    archive.pipe(res);

    // Fan-out / Fan-in
    await NodeManager.streamBatchZip(jobsByNodeId, archive);

    archive.finalize();
    console.log(`[BatchService] archive.finalize() llamado — stream ZIP enviando al cliente`);
  }
}

module.exports = new BatchService();
