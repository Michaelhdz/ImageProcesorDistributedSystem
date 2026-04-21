'use strict';
require('dotenv').config();
const app         = require('./app');
const NodeManager = require('./services/node.manager');

const PORT = parseInt(process.env.PORT || '3000');

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Servidor de Aplicación — Sistema Distribuido UPB');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Puerto:      ${PORT}`);
  console.log(`  BD API:      ${process.env.BD_API_URL || 'http://192.168.1.22:8000'}`);
  console.log(`  Redis:       ${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`);
  console.log('═══════════════════════════════════════════════════════');
  NodeManager.startHealthChecks();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[Server] Señal ${signal} recibida — iniciando cierre ordenado...`);
  NodeManager.stopHealthChecks();
  server.close(() => {
    console.log('[Server] Servidor HTTP cerrado');
    process.exit(0);
  });
  // Forzar cierre después de 10s si no termina
  setTimeout(() => {
    console.error('[Server] Cierre forzado por timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[Server] Excepción no capturada:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Promesa rechazada sin manejar:', reason);
});
