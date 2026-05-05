const express = require('express');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth',    require('./routes/auth.routes'));
app.use('/api/batches', require('./routes/batch.routes'));

app.get('/health', (req, res) => {
  res.json({
    status:     'OK',
    timestamp:  new Date().toISOString(),
    appServer:  process.env.APP_SERVER_URL || 'http://192.168.1.20:3000',
    autenticado: !!global.authToken
  });
});

module.exports = app;
