'use strict';
const express        = require('express');
const router         = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const NodeController = require('../controllers/node.controller');

// Sin JWT — autenticado por X-Internal-Key
// Solo accesible desde la red interna (los nodos lo llaman al arrancar)
router.post(
  '/heartbeat',
  (req, res) => NodeController.receiveHeartbeat(req, res)
);

// Con JWT — operaciones administrativas
router.post(
  '/',
  authMiddleware,
  (req, res) => NodeController.registerNode(req, res)
);

router.get(
  '/',
  authMiddleware,
  (req, res) => NodeController.listNodes(req, res)
);

router.get(
  '/:id/status',
  authMiddleware,
  (req, res) => NodeController.getNodeStatus(req, res)
);

router.delete(
  '/:id',
  authMiddleware,
  (req, res) => NodeController.deleteNode(req, res)
);

module.exports = router;
