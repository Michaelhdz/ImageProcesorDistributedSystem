const IBatchService = require('../../interfaces/js/IBatchService');
const FormData     = require('form-data');
const { http, rawHttp } = require('./api.client');

class BatchService extends IBatchService {
  async createBatch(userId, files, meta) {
    const form = new FormData();
    for (const file of files) {
      form.append('images', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
    }
    form.append('metadata', JSON.stringify(meta));

    return http.post('/api/batches', form, {
      headers: {
        ...form.getHeaders()
      },
      timeout: 120000
    });
  }

  async getBatchStatus(batchId, userId) {
    return http.get(`/api/batches/${batchId}/status`);
  }

  async getHistory(userId, page, limit) {
    return http.get(`/api/batches?page=${page}&limit=${limit}`);
  }

  async streamImageToClient(imageId, res) {
    const response = await rawHttp.get(
      `/api/batches/${imageId}/download?format=individual&jobId=${imageId}`,
      {
        responseType: 'stream',
        timeout: 300000
      }
    );
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Content-Disposition', response.headers['content-disposition']);
    response.data.pipe(res);
  }

  async streamBatchZipToClient(batchId, userId, res) {
    try {
      const response = await rawHttp.get(
        `/api/batches/${batchId}/download?format=zip`,
        { responseType: 'stream', timeout: 300000 }
      );

      res.setHeader('Content-Type', response.headers['content-type'] || 'application/zip');
      res.setHeader('Content-Disposition', response.headers['content-disposition'] || `attachment; filename=batch_${batchId}.zip`);

      response.data.pipe(res);

      // Monitorear errores del stream
      response.data.on('error', (err) => {
        console.error('[Client] Error en el stream de datos:', err);
        res.end();
      });

    } catch (err) {
      console.error('[Client] Error al conectar con App Server:', err.message);
      res.status(500).json({ error: 'No se pudo generar el archivo de descarga' });
    }
  }
}

module.exports = new BatchService();
