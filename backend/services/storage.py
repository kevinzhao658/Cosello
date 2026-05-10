"""Supabase Storage wrapper for Cosello image uploads.

Two-function surface: upload_image() pushes preprocessed bytes into the
`cosello-images` public bucket and returns the public URL; download_image()
fetches bytes back given that URL — used by the listing-generation pipeline
adapter that needs raw bytes for the Vision/Claude calls.
"""
from __future__ import annotations

import os
import uuid
from typing import Optional

import httpx
from fastapi import HTTPException
from supabase import create_client, Client


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
        _get_client().storage.from_(BUCKET_NAME).upload(
            path=object_path,
            file=raw_bytes,
            file_options={"content-type": content_type},
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Supabase Storage upload failed: {e}",
        )

    return _public_url(object_path)


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
