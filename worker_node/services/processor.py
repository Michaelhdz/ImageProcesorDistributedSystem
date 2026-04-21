"""
ImageProcessor — Encapsula Pillow.
Responsabilidad: saber cómo aplicar cada tipo de transformación individual.
No sabe en qué orden ni cuántas transformaciones hay — eso es responsabilidad
de TransformationPipeline.
"""
import os
import logging
from PIL import Image, ImageFilter, ImageEnhance, ImageOps, ImageDraw

logger = logging.getLogger(__name__)

STORAGE_BASE = os.getenv('STORAGE_BASE', '/images')


class ImageProcessor:

    def __init__(self):
        self.image        = None
        self._target_fmt  = None   # registrado por convert_format, usado en save_to_disk

    # ── Validación de ruta (previene path traversal) ──────────────────────────

    @staticmethod
    def _validate_path(path: str) -> str:
        base = os.path.realpath(STORAGE_BASE)
        real = os.path.realpath(os.path.abspath(path))
        if not real.startswith(base + os.sep) and real != base:
            raise ValueError(f"Ruta fuera del directorio permitido: {path}")
        return real

    # ── I/O ───────────────────────────────────────────────────────────────────

    def load_from_disk(self, path: str):
        safe_path = self._validate_path(path)
        if not os.path.exists(safe_path):
            raise FileNotFoundError(f"Archivo no encontrado: {safe_path}")
        self.image = Image.open(safe_path)
        # Convertir a RGB si está en modo P (paleta) para evitar problemas en transformaciones
        if self.image.mode == 'P':
            self.image = self.image.convert('RGBA')
        logger.info(f"[ImageProcessor] Imagen cargada: {safe_path} | modo={self.image.mode} | tamaño={self.image.size}")

    def save_to_disk(self, path: str):
        safe_path = self._validate_path(path)
        os.makedirs(os.path.dirname(safe_path), exist_ok=True)

        fmt = self._target_fmt or self._infer_format(safe_path)
        fmt = fmt.upper()

        # JPEG no soporta transparencia — convertir a RGB
        if fmt in ('JPEG', 'JPG') and self.image.mode in ('RGBA', 'LA', 'P'):
            logger.info(f"[ImageProcessor] Convirtiendo {self.image.mode} → RGB para JPEG")
            self.image = self.image.convert('RGB')

        save_fmt = 'JPEG' if fmt == 'JPG' else fmt
        self.image.save(safe_path, format=save_fmt)
        logger.info(f"[ImageProcessor] Imagen guardada: {safe_path} | formato={save_fmt}")

    @staticmethod
    def _infer_format(path: str) -> str:
        if '.' in path:
            return path.rsplit('.', 1)[-1].upper()
        return 'JPEG'

    # ── Transformaciones ──────────────────────────────────────────────────────

    def to_grayscale(self):
        logger.info("[ImageProcessor] Transformación: GRAYSCALE")
        self.image = self.image.convert('L')

    def resize(self, width: int, height: int):
        logger.info(f"[ImageProcessor] Transformación: RESIZE {self.image.size} → ({width},{height})")
        self.image = self.image.resize((width, height), Image.LANCZOS)

    def crop(self, x: int, y: int, w: int, h: int):
        img_w, img_h = self.image.size
        x2 = min(x + w, img_w)
        y2 = min(y + h, img_h)
        logger.info(f"[ImageProcessor] Transformación: CROP ({x},{y},{x2},{y2})")
        self.image = self.image.crop((x, y, x2, y2))

    def rotate(self, degrees: int):
        logger.info(f"[ImageProcessor] Transformación: ROTATE {degrees}°")
        self.image = self.image.rotate(degrees, expand=True)

    def flip(self, direction: str = 'horizontal'):
        logger.info(f"[ImageProcessor] Transformación: FLIP {direction}")
        if direction == 'horizontal':
            self.image = ImageOps.mirror(self.image)
        else:
            self.image = ImageOps.flip(self.image)

    def blur(self, radius: float = 2.0):
        logger.info(f"[ImageProcessor] Transformación: BLUR radius={radius}")
        self.image = self.image.filter(ImageFilter.GaussianBlur(radius=radius))

    def sharpen(self, factor: float = 2.0):
        logger.info(f"[ImageProcessor] Transformación: SHARPEN factor={factor}")
        self.image = ImageEnhance.Sharpness(self.image).enhance(factor)

    def adjust_brightness_contrast(self, brightness: float = 1.0, contrast: float = 1.0):
        logger.info(f"[ImageProcessor] Transformación: BRIGHTNESS_CONTRAST b={brightness} c={contrast}")
        self.image = ImageEnhance.Brightness(self.image).enhance(brightness)
        self.image = ImageEnhance.Contrast(self.image).enhance(contrast)

    def add_watermark(self, text: str, position: str = 'bottom_right'):
        logger.info(f"[ImageProcessor] Transformación: WATERMARK '{text}' @ {position}")
        # Asegurar modo compatible con transparencia
        if self.image.mode not in ('RGBA', 'RGB'):
            self.image = self.image.convert('RGB')
        draw   = ImageDraw.Draw(self.image)
        w, h   = self.image.size
        margin = 10
        positions = {
            'bottom_right': (w - 160, h - 30),
            'bottom_left':  (margin,  h - 30),
            'top_right':    (w - 160, margin),
            'top_left':     (margin,  margin),
        }
        xy = positions.get(position, positions['bottom_right'])
        draw.text(xy, text, fill=(255, 255, 255, 200))

    def convert_format(self, fmt: str):
        """Registra el formato destino; la conversión ocurre en save_to_disk."""
        logger.info(f"[ImageProcessor] Transformación: CONVERT → {fmt.upper()}")
        self._target_fmt = fmt.upper()
