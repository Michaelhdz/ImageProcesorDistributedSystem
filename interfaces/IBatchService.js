'use strict';
/**
 * IBatchService — Contrato de gestión de lotes
 * Implementado por: BatchService
 * Consumido por:    BatchController
 */
class IBatchService {
  async createBatch(userId, files, metadata) {
    throw new Error('IBatchService.createBatch() no implementado');
  }
  async getBatchStatus(batchId, userId) {
    throw new Error('IBatchService.getBatchStatus() no implementado');
  }
  async getHistory(userId, page, limit) {
    throw new Error('IBatchService.getHistory() no implementado');
  }
  async streamImageToClient(imageId, userId, res) {
    throw new Error('IBatchService.streamImageToClient() no implementado');
  }
  async streamBatchZipToClient(batchId, userId, res) {
    throw new Error('IBatchService.streamBatchZipToClient() no implementado');
  }
}
module.exports = IBatchService;
