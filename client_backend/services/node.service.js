const INodeService = require('../../interfaces/js/INodeService');
const { http } = require('./api.client');

class NodeService extends INodeService {
  async receiveHeartbeat(host, port) {
    return http.post('/api/nodes/heartbeat', { host, port }, {
      headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY || 'clave-interna-upb-2025' }
    });
  }

  async registerNode(name, host, port) {
    return http.post('/api/nodes', { name, host, port });
  }

  async listNodes() {
    return http.get('/api/nodes');
  }

  async getNodeStatus(nodeId) {
    return http.get(`/api/nodes/${nodeId}`);
  }

  async deleteNode(nodeId) {
    await http.delete(`/api/nodes/${nodeId}`);
  }
  async getSystemMetrics() {
    return http.get('/api/nodes/metrics');
  }
}

module.exports = new NodeService();
