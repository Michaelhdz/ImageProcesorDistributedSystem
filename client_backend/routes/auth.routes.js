// routes/auth.routes.js
const express        = require('express');
const router         = express.Router();
const AuthController = require('../controllers/auth.controller');

router.post('/register', (req, res) => {
  console.log('[CLIENT_BACKEND] Received POST /api/auth/register:', req.body);
  AuthController.register.bind(AuthController)(req, res);
});
router.post('/login', (req, res) => {
  console.log('[CLIENT_BACKEND] Received POST /api/auth/login:', req.body);
  AuthController.login.bind(AuthController)(req, res);
});

module.exports = router;
