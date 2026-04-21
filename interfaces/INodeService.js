'use strict';
/**
 * INodeService — Contrato de gestión de nodos
 * Implementado por: NodeManager
 * Consumido por:    NodeController
 */
class INodeService {
  async receiveHeartbeat(host, port) {
    throw new Error('INodeService.receiveHeartbeat() no implementado');
  }
  async registerNode(name, host, port) {
    throw new Error('INodeService.registerNode() no implementado');
  }
  async listNodes() {
    throw new Error('INodeService.listNodes() no implementado');
  }
  async getNodeStatus(nodeId) {
    throw new Error('INodeService.getNodeStatus() no implementado');
  }
  async deleteNode(nodeId) {
    throw new Error('INodeService.deleteNode() no implementado');
  }
}
module.exports = INodeService;
