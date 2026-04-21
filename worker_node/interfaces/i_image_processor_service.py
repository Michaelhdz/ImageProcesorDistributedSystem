"""
IImageProcessorService — Contrato gRPC del nodo trabajador.

Implementado por: ImageProcessorServicer
Consumido por:    NodeManager en VM1 (vía stub gRPC generado por protoc)

Esta clase abstracta es la representación Python del contrato definido
en image_processor.proto. Si una subclase no implementa algún método
abstracto, Python lanza TypeError al instanciar.
"""
from abc import ABC, abstractmethod


class IImageProcessorService(ABC):

    @abstractmethod
    def UploadImage(self, request_iterator, context):
        """
        Recibe imagen en chunks desde VM1 (client streaming gRPC).
        Ensambla los chunks y guarda el archivo en disco local.

        Args:
            request_iterator: stream de ImageChunk
                { image_id, filename, chunk_data: bytes, is_last: bool }
            context: contexto gRPC

        Returns:
            UploadResponse { image_id, local_input_path, success, error_message }
        """
        pass

    @abstractmethod
    def ProcessImage(self, request, context):
        """
        Ejecuta el pipeline de transformaciones sobre una imagen
        ya almacenada en disco local del nodo.

        Args:
            request: ProcessRequest
                { job_id, image_id, transformations: [{ type, params, exec_order }] }
            context: contexto gRPC

        Returns:
            ProcessResponse { job_id, image_id, success, local_result_path,
                              error_message, duration_ms }
        """
        pass

    @abstractmethod
    def DownloadImage(self, request, context):
        """
        Lee imagen procesada del disco local y la envía en chunks (server streaming).

        Args:
            request: DownloadRequest { image_id }
            context: contexto gRPC

        Yields:
            ImageChunk { image_id, filename, chunk_data, is_last }
        """
        pass

    @abstractmethod
    def DownloadBatchImages(self, request, context):
        """
        Lee múltiples imágenes del disco local y las envía en stream continuo.
        Implementa el lado nodo del patrón fan-out/fan-in.
        Cada chunk incluye image_id y filename para identificar el archivo en VM1.

        Args:
            request: BatchDownloadRequest { batch_id, image_ids: [int] }
            context: contexto gRPC

        Yields:
            ImageChunk { image_id, filename, chunk_data, is_last }
        """
        pass

    @abstractmethod
    def GetHealth(self, request, context):
        """
        Devuelve estado operacional del nodo.
        Usado por NodeManager para least-load y health checks periódicos.

        Args:
            request: HealthRequest {} (vacío)
            context: contexto gRPC

        Returns:
            HealthResponse { status, active_jobs, cpu_usage_pct, mem_usage_pct }
        """
        pass
