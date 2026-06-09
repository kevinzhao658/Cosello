"""Backfill zip_code + latitude/longitude on existing listings that lack geo data.

Idempotent: safe to run multiple times. Listings that already have a zip_code
are skipped (their coords are already set from the original create_listing call
or a previous backfill run).

Distribution: listings are ordered by posted_at ascending and assigned ZIPs
round-robin over every ZIP present in zip_centroids. This gives a realistic
geographic spread across the Manhattan coverage area.

Run: cd backend && python -m scripts.backfill_listing_zips
"""
import os
from pathlib import Path

# Load .env before importing database (which reads DATABASE_URL at import time).
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from database import SessionLocal
from models import Listing, ZipCentroid
from services.geo import round_coord


def main() -> None:
    db = SessionLocal()
    try:
        # Fetch all seeded ZIPs, ordered deterministically so round-robin is stable.
        zips = db.query(ZipCentroid).order_by(ZipCentroid.zip_code).all()
        if not zips:
            print("No ZIP centroids found — run scripts/seed_zip_centroids.py first.")
            return

        seeded_zips = zips  # list of ZipCentroid rows

        # Fetch listings that have no zip_code set, ordered by posted_at ascending.
        listings = (
            db.query(Listing)
            .filter(Listing.zip_code == None)
            .order_by(Listing.posted_at.asc())
            .all()
        )

        if not listings:
            print("All listings already have zip_code set — nothing to backfill.")
            return

        updated = 0
        sample: list[tuple[str, str]] = []  # (listing_id, zip_code)

        for i, listing in enumerate(listings):
            centroid = seeded_zips[i % len(seeded_zips)]
            listing.zip_code = centroid.zip_code
            listing.latitude = round_coord(centroid.latitude)
            listing.longitude = round_coord(centroid.longitude)
            updated += 1
            if len(sample) < 8:
                sample.append((listing.id, centroid.zip_code))

        db.commit()

        print(f"Backfilled {updated} listings across {len(seeded_zips)} ZIPs.")
        print("Sample assignments (listing_id -> zip_code):")
        for lid, z in sample:
            print(f"  {lid} -> {z}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
