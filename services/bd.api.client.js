'use strict';
require('dotenv').config();
const axios   = require('axios');
const IBdApi  = require('../interfaces/IBdApi');

const RAW_URLS = process.env.BD_API_URL || 'http://192.168.1.22:8000';
const URLS = RAW_URLS.split(',').map(url => url.trim());

const MAX_RETRIES  = 3;
const RETRY_DELAY  = 500; // ms

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const http = axios.create({
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' }
});

http.interceptors.response.use(
  res => res.data,
  async err => {
    const status  = err.response?.status;
    const message = err.response?.data?.detail || err.response?.data?.error || err.message;
    const error   = new Error(message);
    error.status  = status;
    throw error;
  }
);

async function withRetry(methodName, path, body, label) {
  let lastErr;
  const m = String(methodName).toLowerCase();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // 1. Limpiamos la URL base y el path de espacios o caracteres extraños
    const base = URLS[(attempt - 1) % URLS.length].trim();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    try {
      // 2. Usamos el constructor nativo para validar la URL
      const urlObj = new URL(cleanPath, base);
      const finalUrl = urlObj.toString();

      return await http.request({
        method: m,
        url: finalUrl,
        data: body
      });
    } catch (err) {
      lastErr = err;
      if (err.status && err.status >= 400 && err.status < 500) throw err;
      
      // Si falla, mostramos exactamente qué URL se intentó usar para depurar
      console.warn(`[BdApiClient] ${label} — Intento ${attempt}/${MAX_RETRIES} fallido en ${URLS[(attempt - 1) % URLS.length]}: ${err.message}`);
      
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY * attempt);
    }
  }
  throw lastErr;
}

class BdApiClient extends IBdApi {
  get(path) {
    return withRetry(() => http.get(path), `GET ${path}`);
  }
  post(path, body) {
    return withRetry(() => http.post(path, body), `POST ${path}`);
  }
  patch(path, body) {
    return withRetry(() => http.patch(path, body), `PATCH ${path}`);
  }
  delete(path) {
    return withRetry(() => http.delete(path), `DELETE ${path}`);
  }
  saveMetrics(metricsData) {
    return this.post('/metrics', metricsData);
  }
}


module.exports = new BdApiClient();
