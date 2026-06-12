"""Derive a ZIP for existing ZIP-less users from their neighborhood. Idempotent:
only fills users with a neighborhood and no ZIP; leaves zip_confirmed=False so
the confirm-banner nudges them. Never overwrites an existing ZIP. Run at deploy.
Run: cd backend && python -m scripts.derive_user_zips
"""
import os
from pathlib import Path

# Load .env before importing database (which reads DATABASE_URL at import time).
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from database import SessionLocal
from models import User
from constants.neighborhood_zips import NEIGHBORHOOD_ZIP


def main() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).filter(
            (User.zip_code == None) | (User.zip_code == "")  # noqa: E711
        ).all()
        filled = skipped = 0
        for u in users:
            z = NEIGHBORHOOD_ZIP.get((u.neighborhood or "").strip())
            if z:
                u.zip_code = z
                u.zip_confirmed = False
                filled += 1
            else:
                skipped += 1
        db.commit()
        print(f"Derived ZIPs for {filled} user(s); skipped {skipped} with no mappable neighborhood.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
