'use strict';
const BatchService = require('../services/batch.service');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'];
const MAGIC = {
  jpg:  [0xFF, 0xD8, 0xFF],
  png:  [0x89, 0x50, 0x4E, 0x47],
  tiff: [0x49, 0x49, 0x2A, 0x00]
};

function isValidImageBuffer(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return Object.values(MAGIC).some(magic =>
    magic.every((byte, i) => buffer[i] === byte)
  );
}

class BatchController {

  async submitBatch(req, res) {
    try {
      const userId = req.user.id;
      const files  = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Se requiere al menos una imagen' });
      }

      // Validar tipo por magic number
      for (const file of files) {
        if (!isValidImageBuffer(file.buffer)) {
          return res.status(400).json({
            error: `El archivo "${file.originalname}" no es una imagen válida (JPG, PNG o TIFF)`
          });
        }
      }

      // Parsear metadata
      let metadata = [];
      try {
        metadata = JSON.parse(req.body.metadata || '[]');
      } catch {
        return res.status(400).json({
          error: 'El campo metadata debe ser un JSON válido'
        });
      }

      // Validar que metadata tenga entrada para cada archivo
      for (const file of files) {
        const meta = metadata.find(m => m.filename === file.originalname);
        if (meta?.transformations) {
          if (meta.transformations.length > 5) {
            return res.status(400).json({
              error: `La imagen "${file.originalname}" tiene más de 5 transformaciones`
            });
          }
        }
      }

      const batch = await BatchService.createBatch(userId, files, metadata);
      return res.status(201).json({
        batchId:     batch.id,
        status:      batch.status,
        totalImages: batch.total_images,
        message:     'Lote encolado correctamente'
      });
    } catch (err) {
      console.error('[BatchController] submitBatch error:', err.message);
      if (err.message?.includes('No hay nodos')) {
        return res.status(503).json({ error: err.message });
      }
      return res.status(500).json({ error: err.message || 'Error interno del servidor' });
    }
  }

  async getBatchStatus(req, res) {
    try {
      const batchId = parseInt(req.params.id);
      if (isNaN(batchId)) {
        return res.status(400).json({ error: 'ID de lote inválido' });
      }
      const status = await BatchService.getBatchStatus(batchId, req.user.id);
      if (!status) {
        return res.status(404).json({ error: 'Lote no encontrado' });
      }
      return res.status(200).json(status);
    } catch (err) {
      console.error('[BatchController] getBatchStatus error:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async getHistory(req, res) {
    try {
      const page  = Math.max(1, parseInt(req.query.page  || '1'));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '10')));
      const result = await BatchService.getHistory(req.user.id, page, limit);
      return res.status(200).json(result);
    } catch (err) {
      console.error('[BatchController] getHistory error:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async downloadResult(req, res) {
    try {
      const batchId = parseInt(req.params.id);
      const format  = req.query.format || 'zip';
      const jobId   = req.query.jobId ? parseInt(req.query.jobId) : null;

      if (isNaN(batchId)) {
        return res.status(400).json({ error: 'ID de lote inválido' });
      }

      if (format === 'individual') {
        if (!jobId || isNaN(jobId)) {
          return res.status(400).json({
            error: 'jobId es requerido para descarga individual'
          });
        }
        await BatchService.streamImageToClient(jobId, req.user.id, res);
      } else {
        await BatchService.streamBatchZipToClient(batchId, req.user.id, res);
      }
    } catch (err) {
      console.error('[BatchController] downloadResult error:', err.message);
      if (res.headersSent) return;
      if (err.code === 'NOT_FOUND')       return res.status(404).json({ error: err.message });
      if (err.code === 'NOT_READY')       return res.status(409).json({ error: err.message });
      if (err.code === 'NODE_UNAVAILABLE') return res.status(503).json({ error: err.message });
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
}

module.exports = new BatchController();
