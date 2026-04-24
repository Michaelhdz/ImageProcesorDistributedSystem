"""
ImageProcessorServicer — Implementa el contrato gRPC definido en image_processor.proto.
Responsabilidad: recibir llamadas gRPC, coordinar ImageProcessor y TransformationPipeline,
y responder con los resultados.
"""
import os
import time
import threading
import logging
import psutil
import glob

from generated import image_processor_pb2      as pb
from generated import image_processor_pb2_grpc as pb_grpc
from interfaces.i_image_processor_service import IImageProcessorService
from services.processor import ImageProcessor
from services.pipeline  import TransformationPipeline

logger = logging.getLogger(__name__)

STORAGE_BASE  = os.getenv('STORAGE_BASE', '/images')
UPLOADS_DIR   = os.path.join(STORAGE_BASE, 'uploads')
RESULTS_DIR   = os.path.join(STORAGE_BASE, 'results')
CHUNK_SIZE    = int(os.getenv('CHUNK_SIZE', str(64 * 1024)))
MAX_IMG_SIZE  = int(os.getenv('MAX_IMAGE_SIZE', str(50 * 1024 * 1024)))


def _ensure_dirs():
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)


def _find_file_by_image_id(directory, image_id):
    """
    Busca cualquier archivo en el directorio que contenga el ID de la imagen.
    Soporta patrones como 'result_7_7_xxx.png' o '7_result_xxx.png'
    """
    # Buscamos patrones donde el ID esté rodeado de guiones bajos o al inicio
    # Esto cubrirá tu caso: result_7_7_imagen.png
    patterns = [
        os.path.join(directory, f"*_{image_id}_*"),
        os.path.join(directory, f"{image_id}_*"),
        os.path.join(directory, f"result_{image_id}_*")
    ]
    
    for pattern in patterns:
        files = glob.glob(pattern)
        if files:
            # Retornamos el primer archivo encontrado que coincida
            return files[0]
            
    return None


class ImageProcessorServicer(IImageProcessorService, pb_grpc.ImageProcessorServiceServicer):
    """
    Hereda de IImageProcessorService (contrato abstracto Python)
    y de pb_grpc.ImageProcessorServiceServicer (stub generado por protoc).
    """

    def __init__(self):
        self._active_jobs = 0
        self._lock        = threading.Lock()
        _ensure_dirs()
        logger.info(f"[Servicer] Inicializado | uploads={UPLOADS_DIR} | results={RESULTS_DIR}")

    def _inc_jobs(self):
        with self._lock:
            self._active_jobs += 1

    def _dec_jobs(self):
        with self._lock:
            self._active_jobs = max(0, self._active_jobs - 1)

    # ── UploadImage — client streaming ────────────────────────────────────────

    def UploadImage(self, request_iterator, context):
        image_id   = None
        filename   = None
        chunks     = []
        total_size = 0

        logger.info("[Servicer] UploadImage: stream iniciado")
        try:
            for chunk in request_iterator:
                if image_id is None:
                    image_id = chunk.image_id
                    filename = chunk.filename
                    logger.info(f"[Servicer] UploadImage: imageId={image_id} | filename={filename}")

                data = bytes(chunk.chunk_data)
                total_size += len(data)

                if total_size > MAX_IMG_SIZE:
                    logger.error(f"[Servicer] UploadImage: imagen supera límite {MAX_IMG_SIZE} bytes")
                    context.set_code(pb.grpc.StatusCode.INVALID_ARGUMENT)
                    context.set_details('Imagen supera el tamaño máximo permitido')
                    return pb.UploadResponse(
                        image_id=image_id or 0, success=False,
                        error_message='Imagen supera el tamaño máximo permitido'
                    )
                if data:
                    chunks.append(data)

            if image_id is None:
                return pb.UploadResponse(
                    image_id=0, success=False,
                    error_message='Stream vacío — no se recibieron chunks'
                )

            # Guardar en disco
            safe_filename = os.path.basename(filename)
            input_path    = os.path.join(UPLOADS_DIR, f"{image_id}_{safe_filename}")

            # Validar path traversal
            base = os.path.realpath(STORAGE_BASE)
            real = os.path.realpath(input_path)
            if not real.startswith(base):
                return pb.UploadResponse(
                    image_id=image_id, success=False,
                    error_message='Ruta de destino inválida'
                )

            with open(input_path, 'wb') as f:
                for c in chunks:
                    f.write(c)

            logger.info(f"[Servicer] UploadImage completado | imageId={image_id} | "
                        f"size={total_size} bytes | ruta={input_path}")
            return pb.UploadResponse(
                image_id        = image_id,
                local_input_path = input_path,
                success         = True,
                error_message   = ''
            )

        except Exception as e:
            logger.exception(f"[Servicer] UploadImage error: {e}")
            return pb.UploadResponse(
                image_id      = image_id or 0,
                success       = False,
                error_message = str(e)
            )

    # ── ProcessImage — unary ──────────────────────────────────────────────────

    def ProcessImage(self, request, context):
        self._inc_jobs()
        start = time.time()
        logger.info(f"[Servicer] ProcessImage: jobId={request.job_id} | imageId={request.image_id} | "
                    f"transformaciones={len(request.transformations)}")
        try:
            # Buscar archivo de entrada
            input_file = _find_file_by_image_id(UPLOADS_DIR, request.image_id)
            if not input_file:
                raise FileNotFoundError(
                    f"Archivo de entrada no encontrado para imageId={request.image_id} en {UPLOADS_DIR}"
                )

            # Cargar imagen
            processor = ImageProcessor()
            processor.load_from_disk(input_file)

            # Construir y ejecutar pipeline
            pipeline = TransformationPipeline()
            for t in sorted(request.transformations, key=lambda x: x.exec_order):
                pipeline.add_step(t.type, t.params)
            pipeline.execute(processor)

            # Guardar resultado
            original_name   = os.path.basename(input_file)
            result_filename = f"result_{request.image_id}_{original_name}"
            result_path     = os.path.join(RESULTS_DIR, result_filename)
            processor.save_to_disk(result_path)

            duration_ms = int((time.time() - start) * 1000)
            logger.info(f"[Servicer] ProcessImage completado | jobId={request.job_id} | "
                        f"{duration_ms}ms | resultado={result_path}")

            return pb.ProcessResponse(
                job_id            = request.job_id,
                image_id          = request.image_id,
                success           = True,
                local_result_path = result_path,
                error_message     = '',
                duration_ms       = duration_ms
            )

        except Exception as e:
            duration_ms = int((time.time() - start) * 1000)
            logger.exception(f"[Servicer] ProcessImage error | jobId={request.job_id}: {e}")
            return pb.ProcessResponse(
                job_id        = request.job_id,
                image_id      = request.image_id,
                success       = False,
                error_message = str(e),
                duration_ms   = duration_ms
            )
        finally:
            self._dec_jobs()

    # ── DownloadImage — server streaming ──────────────────────────────────────

    def DownloadImage(self, request, context):
        logger.info(f"[Servicer] DownloadImage: imageId={request.image_id}")
        result_file = _find_file_by_image_id(RESULTS_DIR, request.image_id)

        if not result_file:
            logger.error(f"[Servicer] DownloadImage: imageId={request.image_id} no encontrada en {RESULTS_DIR}")
            context.set_code(pb.grpc.StatusCode.NOT_FOUND)
            context.set_details(f'Imagen {request.image_id} no encontrada')
            return

        filename    = os.path.basename(result_file)
        total_bytes = 0

        try:
            with open(result_file, 'rb') as f:
                while True:
                    data = f.read(CHUNK_SIZE)
                    if not data:
                        break
                    total_bytes += len(data)
                    yield pb.ImageChunk(
                        image_id   = request.image_id,
                        filename   = filename,
                        chunk_data = data,
                        is_last    = False
                    )
            # Chunk final vacío con is_last=True
            yield pb.ImageChunk(
                image_id   = request.image_id,
                filename   = filename,
                chunk_data = b'',
                is_last    = True
            )
            logger.info(f"[Servicer] DownloadImage completado | imageId={request.image_id} | "
                        f"{total_bytes} bytes enviados")
        except Exception as e:
            logger.exception(f"[Servicer] DownloadImage error: {e}")
            context.set_code(pb.grpc.StatusCode.INTERNAL)
            context.set_details(str(e))

    # ── DownloadBatchImages — server streaming (fan-out) ──────────────────────

    def DownloadBatchImages(self, request, context):
        logger.info(f"[Servicer] DownloadBatchImages: batchId={request.batch_id} | "
                    f"imageIds={list(request.image_ids)}")
        total_images = 0
        total_bytes  = 0

        for image_id in request.image_ids:
            result_file = _find_file_by_image_id(RESULTS_DIR, image_id)
            if not result_file:
                logger.warning(f"[Servicer] DownloadBatchImages: imageId={image_id} no encontrada — omitida")
                continue

            filename     = os.path.basename(result_file)
            image_bytes  = 0
            total_images += 1

            try:
                with open(result_file, 'rb') as f:
                    while True:
                        data = f.read(CHUNK_SIZE)
                        if not data:
                            break
                        image_bytes += len(data)
                        total_bytes += len(data)
                        yield pb.ImageChunk(
                            image_id   = image_id,
                            filename   = filename,
                            chunk_data = data,
                            is_last    = False
                        )
                # Marcar fin de esta imagen con is_last=True
                yield pb.ImageChunk(
                    image_id   = image_id,
                    filename   = filename,
                    chunk_data = b'',
                    is_last    = True
                )
                logger.info(f"[Servicer] DownloadBatchImages: imageId={image_id} enviada | {image_bytes} bytes")
            except Exception as e:
                logger.exception(f"[Servicer] DownloadBatchImages error en imageId={image_id}: {e}")
                continue

        logger.info(f"[Servicer] DownloadBatchImages completado | "
                    f"{total_images} imágenes | {total_bytes} bytes totales")

    # ── GetHealth — unary ─────────────────────────────────────────────────────

    def GetHealth(self, request, context):
        with self._lock:
            active = self._active_jobs
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory().percent
        active_threads = threading.active_count()
        logger.debug(f"[Servicer] GetHealth: active_jobs={active} | CPU={cpu:.1f}% | MEM={mem:.1f}% `| Threads={active_threads}")
        return pb.HealthResponse(
            status        = 'SERVING',
            active_jobs   = active,
            cpu_usage_pct = cpu,
            mem_usage_pct = mem,
            active_threads = active_threads
        )
