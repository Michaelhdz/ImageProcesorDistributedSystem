'use strict';
require('dotenv').config();
const NodeManager  = require('../services/node.manager');
const BdApiClient  = require('../services/bd.api.client');

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'clave-interna-upb-2025';

class NodeController {

  async receiveHeartbeat(req, res) {
    try {
      // Verificar clave interna
      const key = req.headers['x-internal-key'];
      if (!key || key !== INTERNAL_KEY) {
        console.warn(`[NodeController] Heartbeat rechazado — clave interna incorrecta desde ${req.ip}`);
        return res.status(401).json({ error: 'Clave interna inválida' });
      }

      const { host, port, cpu_usage_pct, mem_usage_pct, active_jobs } = req.body;
      if (!host || !port) {
        return res.status(400).json({ error: 'host y port son requeridos' });
      }
      if (typeof port !== 'number' && isNaN(parseInt(port))) {
        return res.status(400).json({ error: 'port debe ser un número' });
      }

      const node = await NodeManager.receiveHeartbeat(host, parseInt(port));

      if (cpu !== undefined && ram !== undefined) {
        BdApiClient.saveMetrics({
          node_id: `${host}:${port}`, // O usa node.id si prefieres el ID numérico
          cpu_usage: cpu,
          ram_usage: ram,
          active_threads: threads || 0
        }).catch(err => console.error('[NodeController] Error persistiendo métricas:', err.message));
        // Nota: No usamos 'await' para no retrasar la respuesta al Worker (Fire and forget)
      }

      return res.status(200).json({ nodeId: node.id });
    } catch (err) {
      console.error('[NodeController] heartbeat error:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async registerNode(req, res) {
    try {
      const { name, host, port } = req.body;
      if (!host || !port) {
        return res.status(400).json({ error: 'host y port son requeridos' });
      }
      const node = await NodeManager.registerNode(name, host, parseInt(port));
      return res.status(201).json(node);
    } catch (err) {
      console.error('[NodeController] registerNode error:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async listNodes(req, res) {
    try {
      const nodes = await NodeManager.listNodes();
      return res.status(200).json(nodes);
    } catch (err) {
      console.error('[NodeController] listNodes error:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async getNodeStatus(req, res) {
    try {
      const nodeId = parseInt(req.params.id);
      if (isNaN(nodeId)) {
        return res.status(400).json({ error: 'ID de nodo inválido' });
      }
      const node = await NodeManager.getNodeStatus(nodeId);
      if (!node) {
        return res.status(404).json({ error: 'Nodo no encontrado' });
      }
      return res.status(200).json(node);
    } catch (err) {
      console.error('[NodeController] getNodeStatus error:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async deleteNode(req, res) {
    try {
      const nodeId = parseInt(req.params.id);
      if (isNaN(nodeId)) {
        return res.status(400).json({ error: 'ID de nodo inválido' });
      }
      await NodeManager.deleteNode(nodeId);
      return res.status(204).send();
    } catch (err) {
      console.error('[NodeController] deleteNode error:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
}

module.exports = new NodeController();
