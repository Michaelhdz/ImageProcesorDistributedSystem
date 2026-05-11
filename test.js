const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, 'proto/image_processor.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDef).imageprocessor;

function startServer() {
  const server = new grpc.Server();
  server.addService(proto.ImageProcessorService.service, {
    ProcessImage: (call, callback) => {
      console.log('Received ProcessImage request:');
      console.log(JSON.stringify(call.request, null, 2));
      callback(null, { success: true });
    }
  });
  server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
    console.log('Server running');
    
    // Start client
    const client = new proto.ImageProcessorService('localhost:50051', grpc.credentials.createInsecure());
    client.ProcessImage({
      job_id: 1,
      image_id: 2,
      transformations: [
        { type: 'ROTATE', params: '{"degrees": 90}', exec_order: 1 }
      ]
    }, (err, response) => {
      if (err) console.error(err);
      console.log('Client received response:', response);
      server.forceShutdown();
    });
  });
}

startServer();
