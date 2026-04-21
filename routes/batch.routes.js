'use strict';
const express         = require('express');
const router          = express.Router();
const multer          = require('multer');
const authMiddleware  = require('../middleware/auth.middleware');
const BatchController = require('../controllers/batch.controller');

// Almacenar en memoria — los bytes se envían directamente al nodo vía gRPC
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 } // 50 MB por archivo
});

router.post(
  '/',
  authMiddleware,
  upload.array('images', 50), // máximo 50 imágenes por lote
  (req, res) => BatchController.submitBatch(req, res)
);

router.get(
  '/',
  authMiddleware,
  (req, res) => BatchController.getHistory(req, res)
);

router.get(
  '/:id/status',
  authMiddleware,
  (req, res) => BatchController.getBatchStatus(req, res)
);

router.get(
  '/:id/download',
  authMiddleware,
  (req, res) => BatchController.downloadResult(req, res)
);

module.exports = router;
