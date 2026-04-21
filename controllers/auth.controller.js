'use strict';
const AuthService = require('../services/auth.service');

class AuthController {

  async register(req, res) {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({
          error: 'Los campos username, email y password son requeridos'
        });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'El password debe tener mínimo 8 caracteres' });
      }
      const user = await AuthService.createUser({ username, email, password });
      return res.status(201).json({
        id:       user.id,
        username: user.username,
        email:    user.email
      });
    } catch (err) {
      if (err.code === 'CONFLICT') {
        return res.status(409).json({ error: err.message });
      }
      console.error('[AuthController] register error:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Los campos email y password son requeridos' });
      }
      const result = await AuthService.login(email, password);
      return res.status(200).json(result);
    } catch (err) {
      if (err.code === 'UNAUTHORIZED') {
        return res.status(401).json({ error: err.message });
      }
      console.error('[AuthController] login error:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
}

module.exports = new AuthController();
