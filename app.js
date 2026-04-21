'use strict';
require('dotenv').config();
const express    = require('express');
const rateLimit  = require('express-rate-limit');

const app = express();

// ── Parsers ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Límite general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiadas peticiones. Intenta en 15 minutos.' }
});

// Límite estricto para autenticación (previene fuerza bruta)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { error: 'Demasiados intentos de autenticación. Intenta en 15 minutos.' }
});

// Límite para envío de lotes (operación pesada)
const batchSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      30,
  message:  { error: 'Límite de lotes alcanzado. Intenta en 15 minutos.' }
});

app.use(generalLimiter);

// ── Rutas ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',    authLimiter,  require('./routes/auth.routes'));
app.use('/api/batches', require('./routes/batch.routes'));
app.use('/api/nodes',   require('./routes/node.routes'));

// Aplicar límite de submit solo al POST /api/batches
app.use('/api/batches', (req, res, next) => {
  if (req.method === 'POST') return batchSubmitLimiter(req, res, next);
  next();
});

// ── Health check propio ───────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:    'OK',
    component: 'app-server',
    timestamp: new Date().toISOString(),
    uptime:    `${Math.floor(process.uptime())}s`
  });
});

// ── Manejador de rutas no encontradas ────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ── Manejador global de errores ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[App] Error no manejado:', err.message);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload demasiado grande' });
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
