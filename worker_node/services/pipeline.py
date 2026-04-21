"""
TransformationPipeline — Ejecuta transformaciones en orden sobre ImageProcessor.
Responsabilidad: saber en qué orden se aplican los pasos, no cómo se aplican.
"""
import json
import logging
from services.processor import ImageProcessor

logger = logging.getLogger(__name__)

VALID_TYPES = {
    'GRAYSCALE', 'RESIZE', 'CROP', 'ROTATE', 'FLIP',
    'BLUR', 'SHARPEN', 'BRIGHTNESS_CONTRAST', 'WATERMARK', 'CONVERT'
}


class TransformationPipeline:

    def __init__(self):
        self.steps = []  # lista de (type: str, params: dict)

    def add_step(self, transformation_type: str, params_json: str):
        if transformation_type not in VALID_TYPES:
            raise ValueError(f"Tipo de transformación desconocido: '{transformation_type}'. "
                             f"Válidos: {sorted(VALID_TYPES)}")
        try:
            params = json.loads(params_json) if params_json and params_json.strip() else {}
        except json.JSONDecodeError as e:
            raise ValueError(f"params inválido para {transformation_type}: {e}")
        self.steps.append((transformation_type, params))

    def execute(self, processor: ImageProcessor) -> ImageProcessor:
        dispatch = {
            'GRAYSCALE':
                lambda p: processor.to_grayscale(),
            'RESIZE':
                lambda p: processor.resize(
                    int(p['width']), int(p['height'])),
            'CROP':
                lambda p: processor.crop(
                    int(p['x']), int(p['y']), int(p['w']), int(p['h'])),
            'ROTATE':
                lambda p: processor.rotate(int(p['degrees'])),
            'FLIP':
                lambda p: processor.flip(p.get('direction', 'horizontal')),
            'BLUR':
                lambda p: processor.blur(float(p.get('radius', 2.0))),
            'SHARPEN':
                lambda p: processor.sharpen(float(p.get('factor', 2.0))),
            'BRIGHTNESS_CONTRAST':
                lambda p: processor.adjust_brightness_contrast(
                    float(p.get('brightness', 1.0)),
                    float(p.get('contrast',   1.0))),
            'WATERMARK':
                lambda p: processor.add_watermark(
                    str(p['text']),
                    p.get('position', 'bottom_right')),
            'CONVERT':
                lambda p: processor.convert_format(str(p['format'])),
        }

        logger.info(f"[Pipeline] Ejecutando {len(self.steps)} paso(s)")
        for i, (t_type, params) in enumerate(self.steps, 1):
            logger.info(f"[Pipeline] Paso {i}/{len(self.steps)}: {t_type}")
            try:
                dispatch[t_type](params)
            except KeyError as e:
                raise ValueError(f"Parámetro requerido faltante en {t_type}: {e}")
            except Exception as e:
                raise RuntimeError(f"Error aplicando {t_type}: {e}")

        logger.info("[Pipeline] Todos los pasos ejecutados exitosamente")
        return processor
