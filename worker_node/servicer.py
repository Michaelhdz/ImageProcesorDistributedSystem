import os
import time
import threading
import psutil
from generated import image_processor_pb2      as pb
from generated import image_processor_pb2_grpc as pb_grpc
from processor import ImageProcessor
from pipeline  import TransformationPipeline

STORAGE_BASE  = os.getenv('STORAGE_BASE', os.path.join(os.getcwd(), 'storage'))
UPLOAD_DIR    = os.path.join(STORAGE_BASE, 'uploads')
RESULTS_DIR   = os.path.join(STORAGE_BASE, 'results')
CHUNK_SIZE    = 64 * 1024  # 64 KB

class ImageProcessorServicer(pb_grpc.ImageProcessorServiceServicer):

    def __init__(self):
        self._active_jobs = 0
        self._lock        = threading.Lock()

    def _inc(self):
        with self._lock: self._active_jobs += 1

    def _dec(self):
        with self._lock: self._active_jobs -= 1

    # ── UploadImage (client streaming) ────────────────────────────────────────
    def UploadImage(self, request_iterator, context):
        print("[WORKER_NODE] UploadImage called")
        chunks        = []
        image_id      = None
        filename      = None
        total_bytes   = 0
        MAX_SIZE      = 50 * 1024 * 1024  # 50 MB

        for chunk in request_iterator:
            if image_id is None:
                image_id = chunk.image_id
                filename = chunk.filename
                print(f"[WORKER_NODE] Receiving image: {image_id}, {filename}")
            total_bytes += len(chunk.chunk_data)
            if total_bytes > MAX_SIZE:
                print(f"[WORKER_NODE] Image too large: {total_bytes} bytes")
                context.abort(
                    pb.grpc.StatusCode.INVALID_ARGUMENT,
                    'Imagen supera el límite de 50 MB'
                )
                return
            chunks.append(chunk.chunk_data)

        os.makedirs(UPLOAD_DIR, exist_ok=True)
        input_path = os.path.join(UPLOAD_DIR, f"{image_id}_{filename}")

        # Validar path traversal
        if not os.path.realpath(input_path).startswith(os.path.realpath(STORAGE_BASE)):
            print(f"[WORKER_NODE] Invalid path: {input_path}")
            return pb.UploadResponse(
                image_id=image_id, success=False,
                error_message='Ruta inválida'
            )

        print(f"[WORKER_NODE] Saving image to: {input_path}")
        with open(input_path, 'wb') as f:
            for chunk_data in chunks:
                f.write(chunk_data)
        print(f"[WORKER_NODE] Image saved, total bytes: {total_bytes}")

        return pb.UploadResponse(
            image_id        = image_id,
            local_input_path = input_path,
            success         = True,
            error_message   = ''
        )

    # ── ProcessImage (unary) ──────────────────────────────────────────────────
    def ProcessImage(self, request, context):
        print(f"[WORKER_NODE] ProcessImage called for job: {request.job_id}, image: {request.image_id}")
        self._inc()
        start = time.time()
        try:
            processor = ImageProcessor()
            processor.load_from_disk(
                os.path.join(UPLOAD_DIR, f"{request.image_id}_*")
                if not os.path.exists(os.path.join(UPLOAD_DIR, str(request.image_id)))
                else os.path.join(UPLOAD_DIR, str(request.image_id))
            )

            # Buscar el archivo de entrada por image_id
            input_file = None
            for f in os.listdir(UPLOAD_DIR):
                if f.startswith(f"{request.image_id}_"):
                    input_file = os.path.join(UPLOAD_DIR, f)
                    break

            if not input_file:
                print(f"[WORKER_NODE] Input file not found for image: {request.image_id}")
                return pb.ProcessResponse(
                    job_id=request.job_id, image_id=request.image_id,
                    success=False, error_message='Archivo de entrada no encontrado'
                )

            print(f"[WORKER_NODE] Processing image: {input_file}")
            processor.load_from_disk(input_file)

            pipeline = TransformationPipeline()
            for t in sorted(request.transformations, key=lambda x: x.exec_order):
                print(f"[WORKER_NODE] Adding transformation: {t.type}")
                pipeline.add_step(t.type, t.params)
            pipeline.execute(processor)

            os.makedirs(RESULTS_DIR, exist_ok=True)
            result_filename = f"result_{request.image_id}_{os.path.basename(input_file)}"
            result_path     = os.path.join(RESULTS_DIR, result_filename)
            print(f"[WORKER_NODE] Saving result to: {result_path}")
            processor.save_to_disk(result_path)

            duration_ms = int((time.time() - start) * 1000)
            print(f"[WORKER_NODE] Processing completed in {duration_ms} ms")
            return pb.ProcessResponse(
                job_id           = request.job_id,
                image_id         = request.image_id,
                success          = True,
                local_result_path = result_path,
                error_message    = '',
                duration_ms      = duration_ms
            )
        except Exception as e:
            return pb.ProcessResponse(
                job_id       = request.job_id,
                image_id     = request.image_id,
                success      = False,
                error_message = str(e),
                duration_ms  = int((time.time() - start) * 1000)
            )
        finally:
            self._dec()

    # ── DownloadImage (server streaming) ──────────────────────────────────────
    def DownloadImage(self, request, context):
        result_file = None
        for f in os.listdir(RESULTS_DIR):
            if f.startswith(f"result_{request.image_id}_"):
                result_file = os.path.join(RESULTS_DIR, f)
                break

        if not result_file:
            context.abort(pb.grpc.StatusCode.NOT_FOUND, 'Imagen no encontrada')
            return

        filename = os.path.basename(result_file)
        with open(result_file, 'rb') as f:
            while True:
                data = f.read(CHUNK_SIZE)
                if not data:
                    break
                yield pb.ImageChunk(
                    image_id   = request.image_id,
                    filename   = filename,
                    chunk_data = data,
                    is_last    = False
                )
        yield pb.ImageChunk(
            image_id   = request.image_id,
            filename   = filename,
            chunk_data = b'',
            is_last    = True
        )

    # ── DownloadBatchImages (server streaming) ─────────────────────────────────
    def DownloadBatchImages(self, request, context):
        for image_id in request.image_ids:
            result_file = None
            for f in os.listdir(RESULTS_DIR):
                if f.startswith(f"result_{image_id}_"):
                    result_file = os.path.join(RESULTS_DIR, f)
                    break

            if not result_file:
                continue

            filename = os.path.basename(result_file)
            with open(result_file, 'rb') as f:
                while True:
                    data = f.read(CHUNK_SIZE)
                    if not data:
                        break
                    yield pb.ImageChunk(
                        image_id   = image_id,
                        filename   = filename,
                        chunk_data = data,
                        is_last    = False
                    )
            yield pb.ImageChunk(
                image_id   = image_id,
                filename   = filename,
                chunk_data = b'',
                is_last    = True
            )

    # ── GetHealth (unary) ──────────────────────────────────────────────────────
    def GetHealth(self, request, context):
        return pb.HealthResponse(
            status        = 'SERVING',
            active_jobs   = self._active_jobs,
            cpu_usage_pct = psutil.cpu_percent(interval=0.1),
            mem_usage_pct = psutil.virtual_memory().percent
        )
