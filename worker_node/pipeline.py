import json
from processor import ImageProcessor

class TransformationPipeline:
    def __init__(self):
        self.steps = []

    def add_step(self, transformation_type: str, params_json: str):
        params = json.loads(params_json) if params_json else {}
        self.steps.append((transformation_type, params))

    def execute(self, processor: ImageProcessor) -> ImageProcessor:
        dispatch = {
            'GRAYSCALE':
                lambda p: processor.to_grayscale(),
            'RESIZE':
                lambda p: processor.resize(p['width'], p['height']),
            'CROP':
                lambda p: processor.crop(p['x'], p['y'], p['w'], p['h']),
            'ROTATE':
                lambda p: processor.rotate(p['degrees']),
            'FLIP':
                lambda p: processor.flip(p.get('direction', 'horizontal')),
            'BLUR':
                lambda p: processor.blur(p.get('radius', 2.0)),
            'SHARPEN':
                lambda p: processor.sharpen(p.get('factor', 2.0)),
            'BRIGHTNESS_CONTRAST':
                lambda p: processor.adjust_brightness_contrast(
                    p.get('brightness', 1.0), p.get('contrast', 1.0)),
            'WATERMARK':
                lambda p: processor.add_watermark(
                    p['text'], p.get('position', 'bottom_right')),
            'CONVERT':
                lambda p: processor.convert_format(p['format']),
        }
        for t_type, params in self.steps:
            if t_type not in dispatch:
                raise ValueError(f"Transformación desconocida: {t_type}")
            dispatch[t_type](params)
        return processor
