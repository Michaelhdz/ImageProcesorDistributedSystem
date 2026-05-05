const express         = require('express');
const router          = express.Router();
const multer          = require('multer');
const BatchController = require('../controllers/batch.controller');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/',
  upload.array('images'),
  (req, res) => {
    console.log('[CLIENT_BACKEND] Received POST /api/batches with files:', req.files?.length || 0);
    BatchController.submitBatch.bind(BatchController)(req, res);
  }
);
router.get('/', (req, res) => {
  console.log('[CLIENT_BACKEND] Received GET /api/batches');
  BatchController.getHistory.bind(BatchController)(req, res);
});
router.post('/nodes', (req, res) => {
  console.log('[CLIENT_BACKEND] Received POST /api/batches/nodes');
  BatchController.createNode.bind(BatchController)(req, res);
});
router.get('/:id/status', (req, res) => {
  console.log('[CLIENT_BACKEND] Received GET /api/batches/:id/status');
  BatchController.getBatchStatus.bind(BatchController)(req, res);
});
router.get('/:id/download', (req, res) => {
  console.log('[CLIENT_BACKEND] Received GET /api/batches/:id/download');
  BatchController.downloadResult.bind(BatchController)(req, res);
});
router.get('/metrics', (req, res) => {
  console.log('[CLIENT_BACKEND] Received GET /api/batches/metrics');
  BatchController.getMetrics(req, res);
});

module.exports = router;
