'use strict';
require('dotenv').config();
const bcrypt       = require('bcrypt');
const jwt          = require('jsonwebtoken');
const BdApiClient  = require('./bd.api.client');
const IAuthService = require('../interfaces/IAuthService');

const JWT_SECRET  = process.env.JWT_SECRET  || 'secreto-upb-2025';
const JWT_EXPIRES = '8h';
const BCRYPT_ROUNDS = 10;

class AuthService extends IAuthService {

  async createUser({ username, email, password }) {
    console.log(`[AuthService] Creando usuario: ${username} (${email})`);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      const user = await BdApiClient.post('/users', {
        username,
        email,
        password_hash: passwordHash
      });
      console.log(`[AuthService] Usuario creado con id=${user.id}`);
      return user;
    } catch (err) {
      if (err.status === 409) {
        console.warn(`[AuthService] Conflicto al crear usuario: ${err.message}`);
        const e  = new Error('Email o username ya existe');
        e.code   = 'CONFLICT';
        throw e;
      }
      throw err;
    }
  }

  async login(email, password) {
    console.log(`[AuthService] Intento de login: ${email}`);
    const user = await BdApiClient
      .get(`/users/${encodeURIComponent(email)}`)
      .catch(() => null);

    if (!user) {
      console.warn(`[AuthService] Login fallido — usuario no encontrado: ${email}`);
      const e  = new Error('Credenciales inválidas');
      e.code   = 'UNAUTHORIZED';
      throw e;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      console.warn(`[AuthService] Login fallido — password incorrecto para: ${email}`);
      const e  = new Error('Credenciales inválidas');
      e.code   = 'UNAUTHORIZED';
      throw e;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    console.log(`[AuthService] Login exitoso — userId=${user.id}`);
    return {
      token,
      user: { id: user.id, username: user.username, email: user.email }
    };
  }
}

module.exports = new AuthService();
