const BatchService = require('../services/batch.service');
const NodeService  = require('../services/node.service');

class BatchController {
  // Enviar lote — recibe imágenes y metadata, reenvía al servidor de app
  async submitBatch(req, res) {
    console.log('[CLIENT_BACKEND] BatchController.submitBatch called with files:', req.files?.length || 0);
    try {
      if (!req.files || req.files.length === 0) {
        console.log('[CLIENT_BACKEND] No files provided');
        return res.status(400).json({ error: 'Se requiere al menos una imagen' });
      }

      let metadata = [];
      try {
        metadata = JSON.parse(req.body.metadata || '[]');
      } catch {
        console.log('[CLIENT_BACKEND] Invalid metadata JSON');
        return res.status(400).json({ error: 'El campo metadata debe ser JSON válido' });
      }

      const result = await BatchService.createBatch(null, req.files, metadata);
      console.log('[CLIENT_BACKEND] BatchService response:', result);
      return res.status(201).json(result);
    } catch (err) {
      console.log('[CLIENT_BACKEND] Error in submitBatch:', err.message);
      const status  = err.response?.status || 500;
      const message = err.response?.data?.error || err.message;
      return res.status(status).json({ error: message });
    }
  }

  async getBatchStatus(req, res) {
    console.log('[CLIENT_BACKEND] BatchController.getBatchStatus called for id:', req.params.id);
    try {
      const result = await BatchService.getBatchStatus(req.params.id, null);
      console.log('[CLIENT_BACKEND] BatchService response:', result);
      return res.status(200).json(result);
    } catch (err) {
      console.log('[CLIENT_BACKEND] Error in getBatchStatus:', err.message);
      return res.status(err.response?.status || 500).json({
        error: err.response?.data?.error || err.message
      });
    }
  }

  async getHistory(req, res) {
    console.log('[CLIENT_BACKEND] BatchController.getHistory called with query:', req.query);
    try {
      const page  = parseInt(req.query.page  || '1');
      const limit = parseInt(req.query.limit || '10');
      const result = await BatchService.getHistory(null, page, limit);
      console.log('[CLIENT_BACKEND] BatchService response:', result);
      return res.status(200).json(result);
    } catch (err) {
      console.log('[CLIENT_BACKEND] Error in getHistory:', err.message);
      return res.status(err.response?.status || 500).json({
        error: err.response?.data?.error || err.message
      });
    }
  }

  async downloadResult(req, res) {
    console.log('[CLIENT_BACKEND] BatchController.downloadResult called for id:', req.params.id, 'format:', req.query.format);
    try {
      if (req.query.format === 'individual') {
        await BatchService.streamImageToClient(req.query.jobId, res);
      } else {
        await BatchService.streamBatchZipToClient(req.params.id, null, res);
      }
      return;
    } catch (err) {
      console.log('[CLIENT_BACKEND] Error in downloadResult:', err.message);
      if (!res.headersSent) {
        return res.status(err.response?.status || 500).json({
          error: err.response?.data?.error || err.message
        });
      }
    }
  }

  async listNodes(req, res) {
    console.log('[CLIENT_BACKEND] BatchController.listNodes called');
    try {
      const nodes = await NodeService.listNodes();
      console.log('[CLIENT_BACKEND] NodeService response:', nodes);
      return res.status(200).json(nodes);
    } catch (err) {
      console.log('[CLIENT_BACKEND] Error in listNodes:', err.message);
      return res.status(err.response?.status || 500).json({
        error: err.response?.data?.error || err.message
      });
    }
  }

  async createNode(req, res) {
    console.log('[CLIENT_BACKEND] BatchController.createNode called with:', req.body);
    try {
      const node = await NodeService.registerNode(req.body.name, req.body.host, req.body.port);
      console.log('[CLIENT_BACKEND] NodeService response:', node);
      return res.status(201).json(node);
    } catch (err) {
      console.log('[CLIENT_BACKEND] Error in createNode:', err.message);
      return res.status(err.response?.status || 500).json({
        error: err.response?.data?.error || err.message
      });
    }
  }

  async getMetrics(req, res) {
    console.log('[CLIENT_BACKEND] BatchController.getMetrics called');
    try {
      const metrics = await NodeService.getSystemMetrics();
      console.log('[CLIENT_BACKEND] NodeService response (metrics):', metrics.length, 'nodes found');
      return res.status(200).json(metrics);
    } catch (err) {
      console.log('[CLIENT_BACKEND] Error in getMetrics:', err.message);
      return res.status(err.response?.status || 500).json({
        error: err.response?.data?.error || err.message
      });
    }
  }
}

module.exports = new BatchController();
