'use strict';
/**
 * IBdApi — Contrato del gateway hacia la API REST interna de BD
 * Implementado por: BdApiClient
 * Garantiza que ningún componente conecte directamente a PostgreSQL
 */
class IBdApi {
  async get(path)         { throw new Error('IBdApi.get() no implementado'); }
  async post(path, body)  { throw new Error('IBdApi.post() no implementado'); }
  async patch(path, body) { throw new Error('IBdApi.patch() no implementado'); }
  async delete(path)      { throw new Error('IBdApi.delete() no implementado'); }
}
module.exports = IBdApi;
