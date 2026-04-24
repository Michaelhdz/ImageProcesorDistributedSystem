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
  
  // ASEGURAMOS QUE EL MÉTODO SEA UN STRING LIMPIO
  const m = String(methodName).toUpperCase(); 

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const base = URLS[(attempt - 1) % URLS.length].trim();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    try {
      const urlObj = new URL(cleanPath, base);
      const finalUrl = urlObj.toString();

      // LLAMADA EXPLÍCITA
      const response = await http.request({
        method: m,
        url: finalUrl,
        data: body
      });

      return response.data; // Retornamos los datos directamente
    } catch (err) {
      lastErr = err;
      if (err.response?.status >= 400 && err.response?.status < 500) throw err;
      
      console.warn(`[BdApiClient] ${label} — Intento ${attempt}/${MAX_RETRIES} fallido en ${base}: ${err.message}`);
      
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
