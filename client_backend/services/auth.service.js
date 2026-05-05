const IAuthService = require('../../interfaces/js/IAuthService');
const { http } = require('./api.client');

class AuthService extends IAuthService {
  async createUser(data) {
    return http.post('/api/auth/register', data);
  }

  async login(email, password) {
    return http.post('/api/auth/login', { email, password });
  }

  async validateCredentials(email, password) {
    const result = await http.post('/api/auth/login', { email, password });
    return !!result.token;
  }
}

module.exports = new AuthService();
