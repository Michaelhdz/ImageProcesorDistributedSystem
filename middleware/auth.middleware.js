'use strict';
require('dotenv').config();
const jwt        = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-upb-2025';

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido. Incluir: Authorization: Bearer <token>' });
  }
  try {
    const token   = header.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username, email }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};
