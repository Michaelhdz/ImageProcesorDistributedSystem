'use strict';
/**
 * IAuthService — Contrato de autenticación
 * Implementado por: AuthService
 * Consumido por:    AuthController
 */
class IAuthService {
  /** @returns {Promise<{id,username,email}>} @throws {ConflictError} */
  async createUser({ username, email, password }) {
    throw new Error('IAuthService.createUser() no implementado');
  }
  /** @returns {Promise<{token,user}>} @throws {UnauthorizedError} */
  async login(email, password) {
    throw new Error('IAuthService.login() no implementado');
  }
}
module.exports = IAuthService;
