import io
from collections import OrderedDict

import imagehash
from PIL import Image

from services.google.vision import VisionResult


class PHashCache:
    def __init__(self, max_size: int = 500):
        self._max_size = max_size
        self._store: OrderedDict[str, VisionResult] = OrderedDict()

    def _hash(self, image_bytes: bytes) -> str:
        img = Image.open(io.BytesIO(image_bytes))
        img = img.resize((256, 256))
        return str(imagehash.phash(img))

    def get(self, image_bytes: bytes) -> VisionResult | None:
        key = self._hash(image_bytes)
        if key in self._store:
            self._store.move_to_end(key)
            return self._store[key]
        return None

    def set(self, image_bytes: bytes, result: VisionResult) -> None:
        key = self._hash(image_bytes)
        self._store[key] = result
        self._store.move_to_end(key)
        while len(self._store) > self._max_size:
            self._store.popitem(last=False)
