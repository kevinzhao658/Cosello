import logging

from google.cloud import vision

logger = logging.getLogger(__name__)

_client = None


def get_client() -> vision.ImageAnnotatorClient:
    global _client
    if _client is None:
        _client = vision.ImageAnnotatorClient()
        logger.info("Google Vision client initialized")
    return _client
