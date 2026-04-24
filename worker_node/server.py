"""
server.py — Punto de entrada del nodo trabajador.
Arranca el servidor gRPC y envía heartbeat al Servidor de Aplicación.
"""
import os
import sys
import time
import signal
import logging
import requests
import socket
from concurrent import futures
from dotenv import load_dotenv

load_dotenv()

# ── Configurar logging antes de importar módulos propios ──────────────────────
logging.basicConfig(
    level   = logging.INFO,
    format  = '%(asctime)s [%(levelname)s] %(message)s',
    datefmt = '%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

import grpc
from generated import image_processor_pb2_grpc as pb_grpc
from servicer  import ImageProcessorServicer

GRPC_PORT      = int(os.getenv('GRPC_PORT',      '50051'))
NODE_HOST      = os.getenv('NODE_HOST',           '192.168.56.11')
APP_SERVER_URL = os.getenv('APP_SERVER_URL',      'http://192.168.56.10:3000')
INTERNAL_KEY   = os.getenv('INTERNAL_API_KEY',    'clave-interna-upb-2025')
MAX_WORKERS    = int(os.getenv('MAX_WORKERS',     '4'))
MAX_MSG_SIZE   = 10 * 1024 * 1024  # 10 MB

_server = None  # referencia global para shutdown


# ── Heartbeat ─────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

def get_current_ip():
    """
    Detecta la dirección IP de la interfaz de red activa.
    Ideal para hotspots de móvil donde la IP cambia frecuentemente.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # No necesita conexión real a internet, solo para que el OS elija la IP local correcta
        s.connect(('8.8.8.8', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def send_heartbeat(max_retries: int = 10, retry_delay: int = 5):
    """
    Notifica al Servidor de Aplicación que este nodo está activo.
    Detecta dinámicamente la IP para evitar errores de red (EHOSTUNREACH/DEADLINE_EXCEEDED).
    """
    # 1. Detectar IP real en el momento del envío
    current_ip = get_current_ip()
    grpc_port = int(os.getenv('GRPC_PORT', 50051))
    app_server_url = os.getenv('APP_SERVER_URL', 'http://10.245.168.182:3000') # Ajusta según tu .env
    internal_key = os.getenv('INTERNAL_API_KEY', 'tu_clave_secreta')

    for attempt in range(1, max_retries + 1):
        try:
            url = f"{app_server_url}/api/nodes/heartbeat"
            
            # El secreto es enviar 'current_ip' en lugar de una variable fija
            payload = {
                "host": current_ip, 
                "port": grpc_port
            }
            
            headers = {
                "X-Internal-Key": internal_key, 
                "Content-Type": "application/json"
            }

            logger.info(f"[Heartbeat] Intento {attempt}: Registrando nodo en {current_ip}:{grpc_port}")
            
            response = requests.post(url, json=payload, headers=headers, timeout=8)

            if response.status_code == 200:
                node_id = response.json().get('nodeId')
                logger.info(f"[Heartbeat] ÉXITO — Registrado con nodeId={node_id} en {current_ip}")
                return True
            else:
                logger.warning(f"[Heartbeat] Error {response.status_code}: {response.text}")

        except requests.exceptions.ConnectionError:
            logger.error(f"[Heartbeat] Error de conexión: No se pudo contactar al App Server en {url}")
        except Exception as e:
            logger.error(f"[Heartbeat] Error inesperado: {e}")

        if attempt < max_retries:
            logger.info(f"Reintentando en {retry_delay}s...")
            time.sleep(retry_delay)

    logger.error("[Heartbeat] Fallaron todos los intentos de registro.")
    return False


# ── Graceful shutdown ──────────────────────────────────────────────────────────

def shutdown(signum, frame):
    global _server
    sig_name = signal.Signals(signum).name
    logger.info(f"[Server] Señal {sig_name} recibida — iniciando cierre ordenado...")
    if _server:
        _server.stop(grace=10)  # 10s para terminar llamadas en curso
        logger.info("[Server] Servidor gRPC detenido")
    sys.exit(0)


# ── Arranque ──────────────────────────────────────────────────────────────────

def serve():
    global _server

    logger.info('═══════════════════════════════════════════════════════')
    logger.info('  Nodo Trabajador — Sistema Distribuido UPB')
    logger.info('═══════════════════════════════════════════════════════')
    logger.info(f'  Host:        {NODE_HOST}')
    logger.info(f'  Puerto gRPC: {GRPC_PORT}')
    logger.info(f'  App Server:  {APP_SERVER_URL}')
    logger.info(f'  Storage:     {os.getenv("STORAGE_BASE", "/images")}')
    logger.info(f'  Max workers: {MAX_WORKERS}')
    logger.info('═══════════════════════════════════════════════════════')

    # Crear servidor gRPC con ThreadPoolExecutor
    _server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=MAX_WORKERS),
            options=[
                ('grpc.max_receive_message_length', MAX_MSG_SIZE),
            ('grpc.max_send_message_length',    MAX_MSG_SIZE),
        ]
    )

    pb_grpc.add_ImageProcessorServiceServicer_to_server(
        ImageProcessorServicer(), _server
    )

    _server.add_insecure_port(f'[::]:{GRPC_PORT}')
    _server.start()
    logger.info(f"[Server] Servidor gRPC escuchando en puerto {GRPC_PORT}")

    # Registrar handlers de señales
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT,  shutdown)

    # Enviar heartbeat al Servidor de Aplicación
    send_heartbeat()

    # Mantener proceso activo
    logger.info("[Server] Nodo listo para recibir trabajos")
    _server.wait_for_termination()


if __name__ == '__main__':
    serve()
