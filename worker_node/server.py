import grpc
import os
import requests
import time
from concurrent import futures
from generated import image_processor_pb2_grpc as pb_grpc
from servicer  import ImageProcessorServicer

GRPC_PORT      = int(os.getenv('GRPC_PORT',      '50051'))
NODE_HOST      = os.getenv('NODE_HOST',           'localhost')
APP_SERVER_URL = os.getenv('APP_SERVER_URL',      'http://192.168.1.20:3000')
INTERNAL_KEY   = os.getenv('INTERNAL_API_KEY',    'clave-interna-upb-2025')

def register_heartbeat():
    max_retries = 5
    for attempt in range(max_retries):
        try:
            response = requests.post(
                f"{APP_SERVER_URL}/api/nodes/heartbeat",
                json={ "host": NODE_HOST, "port": GRPC_PORT },
                headers={ "X-Internal-Key": INTERNAL_KEY },
                timeout=5
            )
            data = response.json()
            print(f"[OK] Heartbeat registrado. Node ID: {data.get('nodeId')}")
            return
        except Exception as e:
            print(f"[WARN] Heartbeat fallido (intento {attempt+1}/{max_retries}): {e}")
            time.sleep(3)
    print("[WARN] No se pudo registrar el heartbeat. El servidor continuará activo.")

def serve():
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=4),
        options=[
            ('grpc.max_receive_message_length', 10 * 1024 * 1024),
            ('grpc.max_send_message_length',    10 * 1024 * 1024),
        ]
    )
    pb_grpc.add_ImageProcessorServiceServicer_to_server(
        ImageProcessorServicer(), server
    )
    server.add_insecure_port(f'[::]:{GRPC_PORT}')
    server.start()
    print(f"[OK] Nodo gRPC escuchando en puerto {GRPC_PORT}")
    register_heartbeat()
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
