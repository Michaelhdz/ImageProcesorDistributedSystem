const AuthService = require('../services/auth.service');

class AuthController {
  async register(req, res) {
    console.log('[CLIENT_BACKEND] AuthController.register called with:', req.body);
    try {
      const result = await AuthService.createUser(req.body);
      console.log('[CLIENT_BACKEND] AuthService response:', result);
      return res.status(201).json(result);
    } catch (err) {
      console.log('[CLIENT_BACKEND] Error in register:', err.message);
      return res.status(err.status || 500).json({ error: err.message });
    }
  }

  async login(req, res) {
    console.log('[CLIENT_BACKEND] AuthController.login called with:', req.body);
    try {
      const result = await AuthService.login(req.body.email, req.body.password);
      console.log('[CLIENT_BACKEND] AuthService response:', result);
      global.authToken = result.token;
      console.log('[CLIENT_BACKEND] Token saved globally');
      return res.status(200).json(result);
    } catch (err) {
      console.log('[CLIENT_BACKEND] Error in login:', err.message);
      return res.status(err.status || 500).json({ error: err.message });
    }
  }
}

module.exports = new AuthController();
