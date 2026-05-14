import json
import logging
import os

from google.cloud import vision
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

_client = None


def get_client() -> vision.ImageAnnotatorClient:
    global _client
    if _client is None:
        creds_json = os.getenv("GOOGLE_CREDENTIALS_JSON")
        if creds_json:
            info = json.loads(creds_json)
            credentials = service_account.Credentials.from_service_account_info(info)
            _client = vision.ImageAnnotatorClient(credentials=credentials)
            logger.info("Google Vision client initialized from GOOGLE_CREDENTIALS_JSON")
        else:
            _client = vision.ImageAnnotatorClient()
            logger.info("Google Vision client initialized from GOOGLE_APPLICATION_CREDENTIALS")
    return _client
