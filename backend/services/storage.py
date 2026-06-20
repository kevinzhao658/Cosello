"""Supabase Storage wrapper for Cosello image uploads.

Two-function surface: upload_image() pushes preprocessed bytes into the
`cosello-images` public bucket and returns the public URL; download_image()
fetches bytes back given that URL — used by the listing-generation pipeline
adapter that needs raw bytes for the Vision/Claude calls.
"""
from __future__ import annotations

import errno
import os
import time
import uuid
from typing import Callable, Optional, TypeVar

import httpx
from fastapi import HTTPException
from supabase import create_client, Client

_T = TypeVar("_T")

# Transient errors that warrant a retry with backoff.
# OSError errno 35 (EAGAIN / EWOULDBLOCK) fires when the shared httpx
# connection pool momentarily can't make progress under concurrent load.
# The httpx network errors cover TCP-level transients on the same socket.
_TRANSIENT_HTTPX = (
    httpx.ConnectError,
    httpx.ReadError,
    httpx.PoolTimeout,
    httpx.ConnectTimeout,
)
_RETRY_DELAYS = (0.1, 0.2, 0.4)  # seconds; 4 total attempts (3 sleeps)


def _is_transient(exc: BaseException) -> bool:
    """True when the exception represents a transient, retryable condition."""
    if isinstance(exc, _TRANSIENT_HTTPX):
        return True
    if isinstance(exc, (OSError, BlockingIOError)) and exc.args and exc.args[0] == errno.EAGAIN:
        return True
    return False


def _with_transient_retry(fn: Callable[[], _T]) -> _T:
    """Call fn(); on transient errors sleep and retry up to len(_RETRY_DELAYS) times.

    Non-transient exceptions propagate immediately without retry.
    Uses time.sleep (blocking) intentionally — these callers run on FastAPI's
    threadpool, so blocking sleep is safe and won't stall the event loop.
    """
    last_exc: BaseException | None = None
    for attempt, delay in enumerate((_RETRY_DELAYS + (None,)), start=1):  # 4 slots
        try:
            return fn()
        except Exception as exc:
            if not _is_transient(exc):
                raise
            last_exc = exc
            if delay is None:
                break  # retries exhausted
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc


BUCKET_NAME = "cosello-images"
ALLOWED_CATEGORIES = {"listings", "profiles", "communities"}

_EXT_TO_CONTENT_TYPE = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}

_client: Optional[Client] = None


def _get_client() -> Client:
    """Module-level singleton — instantiated once from env."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env"
            )
        _client = create_client(url, key)
    return _client


def _public_url(path: str) -> str:
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    return f"{base}/storage/v1/object/public/{BUCKET_NAME}/{path}"


def upload_image(category: str, owner_id: str, raw_bytes: bytes, ext: str) -> str:
    """Upload bytes to cosello-images and return the public URL.

    Path layout: {category}/{owner_id}/{uuid}.{ext}
    """
    if category not in ALLOWED_CATEGORIES:
        raise ValueError(f"category must be one of {ALLOWED_CATEGORIES}")
    ext_normalized = (ext or "jpg").lower().lstrip(".")
    content_type = _EXT_TO_CONTENT_TYPE.get(ext_normalized, "image/jpeg")
    filename = f"{uuid.uuid4().hex}.{ext_normalized}"
    object_path = f"{category}/{owner_id}/{filename}"

    try:
        _with_transient_retry(
            lambda: _get_client().storage.from_(BUCKET_NAME).upload(
                path=object_path,
                file=raw_bytes,
                file_options={"content-type": content_type},
            )
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Supabase Storage upload failed: {e}",
        )

    return _public_url(object_path)


def mint_signed_upload_url(category: str, owner_id: str, ext: str) -> dict:
    """Mint a one-shot signed upload URL for a fresh object in cosello-images.

    Returns {upload_url, public_url, path}. Path layout matches upload_image():
    {category}/{owner_id}/{uuid}.{ext}.
    """
    if category not in ALLOWED_CATEGORIES:
        raise ValueError(f"category must be one of {ALLOWED_CATEGORIES}")
    ext_normalized = (ext or "jpg").lower().lstrip(".")
    if ext_normalized not in _EXT_TO_CONTENT_TYPE:
        raise ValueError(f"ext must be one of {sorted(_EXT_TO_CONTENT_TYPE)}")
    object_path = f"{category}/{owner_id}/{uuid.uuid4().hex}.{ext_normalized}"

    try:
        result = _with_transient_retry(
            lambda: _get_client().storage.from_(BUCKET_NAME).create_signed_upload_url(object_path)
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to mint signed upload URL: {e}",
        )

    signed_url = result.get("signed_url") if isinstance(result, dict) else None
    if not signed_url:
        raise HTTPException(
            status_code=502,
            detail=f"Signed upload URL response missing signed_url: {result!r}",
        )

    return {
        "upload_url": signed_url,
        "public_url": _public_url(object_path),
        "path": object_path,
    }


def download_image(url: str) -> bytes:
    """Fetch raw bytes for a Supabase Storage public URL."""
    try:
        resp = httpx.get(url, timeout=30.0)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to download image from Storage: {e}",
        )
    return resp.content


def is_storage_url(url: str) -> bool:
    """True if URL points at our cosello-images bucket public path."""
    if not url:
        return False
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    if not base:
        return False
    return url.startswith(f"{base}/storage/v1/object/public/{BUCKET_NAME}/")


def move_image(src_url: str, dst_category: str, dst_owner_id: str) -> str:
    """Server-side move within cosello-images. Returns the new public URL.

    Used to relocate draft uploads to their final listing folder without
    re-uploading bytes.
    """
    if not is_storage_url(src_url):
        raise ValueError(f"src_url is not a cosello-images Storage URL: {src_url}")
    if dst_category not in ALLOWED_CATEGORIES:
        raise ValueError(f"dst_category must be one of {ALLOWED_CATEGORIES}")

    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    prefix = f"{base}/storage/v1/object/public/{BUCKET_NAME}/"
    src_path = src_url[len(prefix):]

    src_ext = src_path.rsplit(".", 1)[-1].lower() if "." in src_path else "jpg"
    dst_path = f"{dst_category}/{dst_owner_id}/{uuid.uuid4().hex}.{src_ext}"

    try:
        _get_client().storage.from_(BUCKET_NAME).move(src_path, dst_path)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Storage move failed: {e}",
        )

    return _public_url(dst_path)
