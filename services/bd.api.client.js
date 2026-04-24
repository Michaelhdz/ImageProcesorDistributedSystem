'use strict';
require('dotenv').config();
const axios   = require('axios');
const IBdApi  = require('../interfaces/IBdApi');

const BASE_URL     = process.env.BD_API_URL || 'http://192.168.1.22:8000';
const MAX_RETRIES  = 3;
const RETRY_DELAY  = 500; // ms

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const http = axios.create({
  baseURL: BASE_URL,
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

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // No reintentar en errores de cliente (4xx)
      if (err.status && err.status >= 400 && err.status < 500) throw err;
      console.warn(`[BdApiClient] ${label} — intento ${attempt}/${MAX_RETRIES} fallido: ${err.message}`);
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
}


module.exports = new BdApiClient();
