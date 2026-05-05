const app  = require('./app');
const PORT = parseInt(process.env.PORT || '4000');

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[OK] Backend Cliente escuchando en puerto ${PORT}`);
  console.log(`[OK] Servidor de App: ${process.env.APP_SERVER_URL || 'http://192.168.1.20:3000'}`);
});
