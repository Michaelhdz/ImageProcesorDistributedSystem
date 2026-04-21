'use strict';
require('dotenv').config();
const grpc        = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path        = require('path');
const BdApiClient = require('./bd.api.client');
const INodeService = require('../interfaces/INodeService');

const PROTO_PATH = path.join(__dirname, '../proto/image_processor.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDef).imageprocessor;

const CHUNK_SIZE      = 64 * 1024;  // 64 KB por chunk gRPC
const HEALTH_INTERVAL = 30_000;     // 30 segundos entre health checks
const GRPC_OPTIONS    = {
  'grpc.max_receive_message_length': 10 * 1024 * 1024,
  'grpc.max_send_message_length':    10 * 1024 * 1024,
};

class NodeManager extends INodeService {
  constructor() {
    super();
    this.grpcClients      = new Map(); // nodeId -> { client, node }
    this._healthTimer     = null;
  }

  // ── INodeService ────────────────────────────────────────────────────────────

  async receiveHeartbeat(host, port) {
    console.log(`[NodeManager] Heartbeat recibido de ${host}:${port}`);
    const node = await BdApiClient.post('/nodes', { host, port, status: 'ACTIVE' });
    this.registerGrpcClient(node);
    return node;
  }

  async registerNode(name, host, port) {
    console.log(`[NodeManager] Registro manual de nodo ${name} (${host}:${port})`);
    const node = await BdApiClient.post('/nodes', { name, host, port });
    this.registerGrpcClient(node);
    return node;
  }

  async listNodes() {
    return BdApiClient.get('/nodes');
  }

  async getNodeStatus(nodeId) {
    return BdApiClient.get(`/nodes/${nodeId}`).catch(() => null);
  }

  async deleteNode(nodeId) {
    await BdApiClient.delete(`/nodes/${nodeId}`);
    this.removeGrpcClient(nodeId);
    console.log(`[NodeManager] Nodo ${nodeId} eliminado`);
  }

  // ── Gestión de clientes gRPC ────────────────────────────────────────────────

  registerGrpcClient(node) {
    if (this.grpcClients.has(node.id)) {
      console.log(`[NodeManager] Cliente gRPC nodo ${node.id} ya registrado — actualizando last_ping`);
      return;
    }
    const client = new proto.ImageProcessorService(
      `${node.host}:${node.port}`,
      grpc.credentials.createInsecure(),
      GRPC_OPTIONS
    );
    this.grpcClients.set(node.id, { client, node });
    console.log(`[NodeManager] Cliente gRPC registrado — nodo ${node.id} (${node.host}:${node.port})`);
  }

  removeGrpcClient(nodeId) {
    const id = parseInt(nodeId);
    if (this.grpcClients.has(id)) {
      this.grpcClients.delete(id);
      console.log(`[NodeManager] Cliente gRPC eliminado — nodo ${id}`);
    }
  }

  // ── Selección de nodo (least-load) ──────────────────────────────────────────

  async selectNode() {
    if (this.grpcClients.size === 0) {
      throw new Error('No hay nodos registrados en el sistema');
    }
    const candidates = [];
    for (const [nodeId, entry] of this.grpcClients) {
      try {
        const health = await this._getHealth(entry.client);
        if (health.status === 'SERVING') {
          candidates.push({ nodeId, ...entry, activeJobs: health.active_jobs });
          console.log(`[NodeManager] Nodo ${nodeId} disponible — active_jobs: ${health.active_jobs}`);
        } else {
          console.warn(`[NodeManager] Nodo ${nodeId} responde NOT_SERVING`);
        }
      } catch (err) {
        console.warn(`[NodeManager] Nodo ${nodeId} no responde al health check: ${err.message}`);
      }
    }
    if (candidates.length === 0) {
      throw new Error('No hay nodos disponibles (todos inactivos o con error)');
    }
    candidates.sort((a, b) => a.activeJobs - b.activeJobs);
    const selected = candidates[0];
    console.log(`[NodeManager] Nodo seleccionado: ${selected.nodeId} (least-load: ${selected.activeJobs} jobs)`);
    return selected;
  }

  // ── UploadImage — client streaming ──────────────────────────────────────────

  uploadImageToNode(nodeEntry, fileBuffer, imageId, filename) {
    return new Promise((resolve, reject) => {
      console.log(`[NodeManager] Iniciando UploadImage → nodo ${nodeEntry.nodeId} | imageId=${imageId} | filename=${filename} | size=${fileBuffer.length} bytes`);

      const call = nodeEntry.client.UploadImage((err, response) => {
        if (err) {
          console.error(`[NodeManager] UploadImage fallido — nodo ${nodeEntry.nodeId}: ${err.message}`);
          return reject(err);
        }
        if (!response.success) {
          console.error(`[NodeManager] UploadImage rechazado — nodo ${nodeEntry.nodeId}: ${response.error_message}`);
          return reject(new Error(response.error_message));
        }
        console.log(`[NodeManager] UploadImage completado — nodo ${nodeEntry.nodeId} | ruta: ${response.local_input_path}`);
        resolve(response);
      });

      let offset = 0;
      let chunkIndex = 0;
      while (offset < fileBuffer.length) {
        const end     = Math.min(offset + CHUNK_SIZE, fileBuffer.length);
        const isLast  = end >= fileBuffer.length;
        call.write({
          image_id:   imageId,
          filename:   filename,
          chunk_data: fileBuffer.slice(offset, end),
          is_last:    isLast
        });
        chunkIndex++;
        offset = end;
      }
      call.end();
      console.log(`[NodeManager] Stream de upload enviado — ${chunkIndex} chunks`);
    });
  }

  // ── ProcessImage — unary ────────────────────────────────────────────────────

  dispatchProcessing(nodeEntry, jobId, imageId, transformations) {
    return new Promise((resolve, reject) => {
      console.log(`[NodeManager] Despachando ProcessImage → nodo ${nodeEntry.nodeId} | jobId=${jobId} | imageId=${imageId} | transformaciones: ${transformations.length}`);
      nodeEntry.client.ProcessImage(
        { job_id: jobId, image_id: imageId, transformations },
        (err, response) => {
          if (err) {
            console.error(`[NodeManager] ProcessImage fallido — nodo ${nodeEntry.nodeId}: ${err.message}`);
            return reject(err);
          }
          if (response.success) {
            console.log(`[NodeManager] ProcessImage completado — nodo ${nodeEntry.nodeId} | ${response.duration_ms}ms | ruta: ${response.local_result_path}`);
          } else {
            console.error(`[NodeManager] ProcessImage error — nodo ${nodeEntry.nodeId}: ${response.error_message}`);
          }
          resolve(response);
        }
      );
    });
  }

  // ── DownloadImage — server streaming ────────────────────────────────────────

  downloadImageFromNode(nodeEntry, imageId) {
    console.log(`[NodeManager] Iniciando DownloadImage ← nodo ${nodeEntry.nodeId} | imageId=${imageId}`);
    return nodeEntry.client.DownloadImage({ image_id: imageId });
  }

  // ── DownloadBatchImages — server streaming fan-out/fan-in ───────────────────

  async streamBatchZip(jobsByNodeId, archive) {
    const promises = [];

    for (const [nodeId, jobs] of Object.entries(jobsByNodeId)) {
      const nodeIdInt = parseInt(nodeId);
      const nodeEntry = this.grpcClients.get(nodeIdInt);

      if (!nodeEntry) {
        console.warn(`[NodeManager] Fan-out: cliente gRPC no encontrado para nodo ${nodeId} — se omiten ${jobs.length} imágenes`);
        continue;
      }

      const imageIds = jobs.map(j => j.id);
      console.log(`[NodeManager] Fan-out → nodo ${nodeId} | ${imageIds.length} imágenes: [${imageIds.join(', ')}]`);

      const promise = new Promise((resolve, reject) => {
        const stream = nodeEntry.client.DownloadBatchImages({
          batch_id:  jobs[0].batch_id,
          image_ids: imageIds
        });

        // Acumular chunks por imageId para ensamblarlos antes de añadir al ZIP
        const buffers = new Map(); // imageId -> { filename, chunks[] }

        stream.on('data', (chunk) => {
          if (!buffers.has(chunk.image_id)) {
            buffers.set(chunk.image_id, { filename: chunk.filename, chunks: [] });
          }
          if (chunk.chunk_data && chunk.chunk_data.length > 0) {
            buffers.get(chunk.image_id).chunks.push(
              Buffer.from(chunk.chunk_data)
            );
          }
          if (chunk.is_last) {
            const { filename, chunks } = buffers.get(chunk.image_id);
            const fullBuffer = Buffer.concat(chunks);
            archive.append(fullBuffer, { name: filename });
            console.log(`[NodeManager] Fan-in: imagen ${chunk.image_id} (${filename}) añadida al ZIP — ${fullBuffer.length} bytes`);
            buffers.delete(chunk.image_id);
          }
        });

        stream.on('end', () => {
          console.log(`[NodeManager] Fan-in: stream completado para nodo ${nodeId}`);
          resolve();
        });

        stream.on('error', (err) => {
          console.error(`[NodeManager] Fan-in: error en stream de nodo ${nodeId}: ${err.message}`);
          reject(err);
        });
      });

      promises.push(promise);
    }

    await Promise.all(promises);
    console.log(`[NodeManager] Fan-in completado — todos los streams procesados`);
  }

  // ── Health checks periódicos ────────────────────────────────────────────────

  startHealthChecks() {
    this._healthTimer = setInterval(async () => {
      console.log(`[NodeManager] Health check periódico — ${this.grpcClients.size} nodos registrados`);
      for (const [nodeId, { client }] of this.grpcClients) {
        try {
          const health = await this._getHealth(client);
          const status = health.status === 'SERVING' ? 'ACTIVE' : 'INACTIVE';
          await BdApiClient.patch(`/nodes/${nodeId}/status`, {
            status,
            last_ping_at: new Date().toISOString()
          });
          console.log(`[NodeManager] Nodo ${nodeId}: ${status} | jobs=${health.active_jobs} | CPU=${health.cpu_usage_pct?.toFixed(1)}% | MEM=${health.mem_usage_pct?.toFixed(1)}%`);
        } catch (err) {
          console.error(`[NodeManager] Health check fallido — nodo ${nodeId}: ${err.message}`);
          await BdApiClient.patch(`/nodes/${nodeId}/status`, {
            status:       'ERROR',
            last_ping_at: new Date().toISOString()
          }).catch(() => {});
        }
      }
    }, HEALTH_INTERVAL);
    console.log(`[NodeManager] Health checks iniciados (cada ${HEALTH_INTERVAL / 1000}s)`);
  }

  stopHealthChecks() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  _getHealth(client) {
    return new Promise((resolve, reject) => {
      client.GetHealth({}, { deadline: Date.now() + 5000 }, (err, response) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }
}

module.exports = new NodeManager();
