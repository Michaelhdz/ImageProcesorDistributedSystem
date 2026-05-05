const axios    = require('axios');
const FormData = require('form-data');

const APP_SERVER_URL = process.env.APP_SERVER_URL || 'http://192.168.1.20:3000';

const http = axios.create({
  baseURL: APP_SERVER_URL,
  timeout: 60000  // 60s para uploads grandes
});

const rawHttp = axios.create({
  baseURL: APP_SERVER_URL,
  timeout: 60000
});

// Adjunta el token JWT a todas las peticiones si está disponible
const attachToken = config => {
  if (global.authToken) {
    config.headers['Authorization'] = `Bearer ${global.authToken}`;
  }
  return config;
};

http.interceptors.request.use(attachToken);
rawHttp.interceptors.request.use(attachToken);

http.interceptors.response.use(
  res => res.data,
  err => {
    const status  = err.response?.status;
    const message = err.response?.data?.error || err.message;
    const error   = new Error(message);
    error.status  = status;
    throw error;
  }
);

module.exports = { http, rawHttp, APP_SERVER_URL };
