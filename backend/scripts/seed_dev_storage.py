"""Ensure the Storage bucket(s) the app uploads to exist on the target project.

Storage buckets are a Storage-API resource, NOT created by SQL migrations, so a
fresh Supabase project (e.g. cosello-dev) has none — which makes the sell wizard's
signed-upload-url call fail with a 404 "related resource does not exist" (surfaced
as a 502). This idempotently creates the public `cosello-images` bucket to match
prod.

Run (export .env.test first to target cosello-dev):
    cd backend && set -a && source .env.test && set +a && python -m scripts.seed_dev_storage
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")  # base; exported vars (.env.test) win

# Keep in sync with services.storage.BUCKET_NAME.
from services.storage import BUCKET_NAME  # noqa: E402


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    sb = create_client(url, key)
    existing = {b.id for b in sb.storage.list_buckets()}
    if BUCKET_NAME in existing:
        print(f"bucket '{BUCKET_NAME}' already exists")
        return
    # Public bucket: the app serves images via the public object path.
    sb.storage.create_bucket(BUCKET_NAME, options={"public": True})
    print(f"created public bucket '{BUCKET_NAME}'")


if __name__ == "__main__":
    main()
