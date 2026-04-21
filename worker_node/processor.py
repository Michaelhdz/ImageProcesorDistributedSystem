import os
from PIL import Image, ImageFilter, ImageEnhance, ImageOps, ImageDraw

class ImageProcessor:
    def __init__(self):
        self.image       = None
        self._target_fmt = None

    def load_from_disk(self, path: str):
        self._validate_path(path)
        self.image = Image.open(path)

    def save_to_disk(self, path: str):
        self._validate_path(path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        fmt = self._target_fmt or self._infer_format(path)
        if fmt in ('JPEG', 'JPG') and self.image.mode != 'RGB':
            self.image = self.image.convert('RGB')
        self.image.save(path, format='JPEG' if fmt == 'JPG' else fmt)

    def _validate_path(self, path: str):
        base = os.path.realpath('/images')
        real = os.path.realpath(path)
        if not real.startswith(base):
            raise ValueError(f"Ruta fuera del directorio permitido: {path}")

    def _infer_format(self, path: str) -> str:
        ext = path.rsplit('.', 1)[-1].upper() if '.' in path else 'JPEG'
        return ext

    def to_grayscale(self):
        self.image = self.image.convert('L')

    def resize(self, width: int, height: int):
        self.image = self.image.resize((width, height), Image.LANCZOS)

    def crop(self, x: int, y: int, w: int, h: int):
        self.image = self.image.crop((x, y, x + w, y + h))

    def rotate(self, degrees: int):
        self.image = self.image.rotate(degrees, expand=True)

    def flip(self, direction: str = 'horizontal'):
        self.image = ImageOps.mirror(self.image) if direction == 'horizontal' \
                     else ImageOps.flip(self.image)

    def blur(self, radius: float = 2.0):
        self.image = self.image.filter(ImageFilter.GaussianBlur(radius=radius))

    def sharpen(self, factor: float = 2.0):
        self.image = ImageEnhance.Sharpness(self.image).enhance(factor)

    def adjust_brightness_contrast(self, brightness: float = 1.0, contrast: float = 1.0):
        self.image = ImageEnhance.Brightness(self.image).enhance(brightness)
        self.image = ImageEnhance.Contrast(self.image).enhance(contrast)

    def add_watermark(self, text: str, position: str = 'bottom_right'):
        draw   = ImageDraw.Draw(self.image)
        w, h   = self.image.size
        margin = 10
        positions = {
            'bottom_right': (w - 160, h - 30),
            'bottom_left':  (margin, h - 30),
            'top_right':    (w - 160, margin),
            'top_left':     (margin, margin),
        }
        xy = positions.get(position, positions['bottom_right'])
        draw.text(xy, text, fill=(255, 255, 255, 200))

    def convert_format(self, fmt: str):
        self._target_fmt = fmt.upper()
