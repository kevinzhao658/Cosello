"""Seed ~20 geo-test listings spread across Manhattan ZIPs for distance-slider QA.

Each listing carries the tag "geotest" so the batch is trivially cleanable.
Idempotent: deletes existing geotest rows before re-inserting.

Run:
    cd backend && python3 -m scripts.seed_geo_test_listings

Distance column in summary is relative to ZIP 10014 (Chelsea/West Village
boundary — convenient mid-Manhattan reference).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env")

from database import SessionLocal  # noqa: E402
from models import Listing, ZipCentroid  # noqa: E402
from services.geo import haversine_miles, round_coord  # noqa: E402

# ---------------------------------------------------------------------------
# Seller UUIDs (created by seed_test_users.py; hard-coded to avoid an auth
# round-trip — they are stable once seeded).
# ---------------------------------------------------------------------------
SELLERS: dict[str, str] = {
    "Alice Test":  "f468bb92-3e3d-47a0-a341-1ea1893621c5",
    "Bob Test":    "8832ecff-aacc-4e5e-a9fa-886c6d141002",
    "Carol Test":  "8d107fd0-9905-4090-b801-f6d9be1d0c35",
}

# South→north Manhattan ZIP cycle — 17 ZIPs gives good spread from Battery
# Park (~0 mi) to Inwood (~10 mi from 10014).
GEO_ZIPS = [
    "10004", "10038", "10002", "10013", "10014",
    "10011", "10016", "10019", "10022", "10023",
    "10025", "10028", "10029", "10027", "10031",
    "10032", "10040",
]

# Reference ZIP for distance column in summary
REFERENCE_ZIP = "10014"

# ---------------------------------------------------------------------------
# Listing templates — varied brand/name/price/condition/category
# ---------------------------------------------------------------------------
LISTING_TEMPLATES = [
    {"brand": "Levi's",      "name": "501 Jeans",           "price_cents": 4500,  "condition": "Good",      "category": "clothing"},
    {"brand": "Patagonia",   "name": "Nano Puff Jacket",    "price_cents": 8900,  "condition": "Like New",  "category": "clothing"},
    {"brand": "Nike",        "name": "Air Force 1 Sneakers","price_cents": 6500,  "condition": "Good",      "category": "clothing"},
    {"brand": "IKEA",        "name": "KALLAX Shelf Unit",   "price_cents": 3500,  "condition": "Fair",      "category": "furniture"},
    {"brand": "Apple",       "name": "AirPods Pro (2nd gen)","price_cents": 12000,"condition": "Like New",  "category": "electronics"},
    {"brand": "Adidas",      "name": "Stan Smith Sneakers", "price_cents": 4000,  "condition": "Good",      "category": "clothing"},
    {"brand": "West Elm",    "name": "Marble Coffee Table", "price_cents": 22000, "condition": "Good",      "category": "furniture"},
    {"brand": "Zara",        "name": "Oversized Blazer",    "price_cents": 3200,  "condition": "Like New",  "category": "clothing"},
    {"brand": "Sony",        "name": "WH-1000XM5 Headphones","price_cents": 18000,"condition": "Good",      "category": "electronics"},
    {"brand": "REI",         "name": "Camp Chair",          "price_cents": 2800,  "condition": "Fair",      "category": "sports"},
    {"brand": "Lululemon",   "name": "Align Leggings",      "price_cents": 5500,  "condition": "Good",      "category": "clothing"},
    {"brand": "MUJI",        "name": "Acrylic Storage Tower","price_cents": 1800, "condition": "Good",      "category": "other"},
    {"brand": "Carhartt",    "name": "WIP Beanie",          "price_cents": 1600,  "condition": "Like New",  "category": "clothing"},
    {"brand": "Nikon",       "name": "D3500 DSLR Camera",   "price_cents": 35000, "condition": "Good",      "category": "electronics"},
    {"brand": "Pendleton",   "name": "Wool Blanket",        "price_cents": 4200,  "condition": "Good",      "category": "other"},
    {"brand": "Arc'teryx",   "name": "Beta AR Jacket",      "price_cents": 29000, "condition": "Good",      "category": "clothing"},
    {"brand": "IKEA",        "name": "POÄNG Armchair",      "price_cents": 5500,  "condition": "Fair",      "category": "furniture"},
    {"brand": "New Balance", "name": "990v5 Sneakers",      "price_cents": 9500,  "condition": "Like New",  "category": "clothing"},
    {"brand": "Le Creuset",  "name": "Dutch Oven 5.5 qt",   "price_cents": 17000, "condition": "Good",      "category": "other"},
    {"brand": "Hoka",        "name": "Clifton 9 Running Shoes","price_cents": 8200,"condition": "Good",     "category": "sports"},
]

NEIGHBORHOOD_BY_ZIP = {
    "10004": "Financial District",
    "10038": "Fulton Area",
    "10002": "Lower East Side",
    "10013": "Tribeca",
    "10014": "West Village",
    "10011": "Chelsea",
    "10016": "Murray Hill",
    "10019": "Midtown West",
    "10022": "Midtown East",
    "10023": "Lincoln Square",
    "10025": "Upper West Side",
    "10028": "Upper East Side",
    "10029": "East Harlem",
    "10027": "Harlem",
    "10031": "Hamilton Heights",
    "10032": "Washington Heights",
    "10040": "Inwood",
}


def _verify_sellers(db) -> dict[str, str]:
    """Confirm each seller UUID exists in public.users; exit if any missing."""
    from models import User
    verified: dict[str, str] = {}
    missing: list[str] = []
    for name, uid in SELLERS.items():
        row = db.query(User).filter(User.id == uid).first()
        if row is None:
            missing.append(f"  - {name} (expected id={uid})")
        else:
            verified[name] = uid
    if missing:
        print("ERROR: The following test sellers are missing from public.users:")
        for m in missing:
            print(m)
        print("Run: cd backend && python3 -m scripts.seed_test_users")
        sys.exit(1)
    return verified


def main() -> None:
    db = SessionLocal()
    try:
        _run(db)
    finally:
        db.close()


def _run(db) -> None:
    # Verify sellers
    seller_map = _verify_sellers(db)
    seller_names = list(seller_map.keys())   # ["Alice Test", "Bob Test", "Carol Test"]
    seller_ids = [seller_map[n] for n in seller_names]

    # Load ZIP centroids
    centroids: dict[str, tuple[float, float]] = {}
    for z in GEO_ZIPS:
        row = db.get(ZipCentroid, z)
        if row is not None:
            centroids[z] = (row.latitude, row.longitude)
        else:
            print(f"  WARNING: ZIP {z} not found in zip_centroids — skipping")

    ref_row = db.get(ZipCentroid, REFERENCE_ZIP)
    ref_lat, ref_lng = (ref_row.latitude, ref_row.longitude) if ref_row else (40.734, -74.006)

    # Delete existing geotest rows
    deleted = (
        db.query(Listing)
        .filter(Listing.tags.like('%"geotest"%'))
        .delete(synchronize_session=False)
    )
    if deleted:
        print(f"Deleted {deleted} existing geotest listing(s).")

    # Build listings — round-robin ZIPs and sellers
    base_ts = time.time()
    rows: list[Listing] = []
    zip_list = [z for z in GEO_ZIPS if z in centroids]

    for i, tmpl in enumerate(LISTING_TEMPLATES):
        zip_code = zip_list[i % len(zip_list)]
        lat, lng = centroids[zip_code]
        seller_id = seller_ids[i % len(seller_ids)]
        seller_name = seller_names[i % len(seller_names)]
        neighborhood = NEIGHBORHOOD_BY_ZIP.get(zip_code, zip_code)

        listing_id = uuid4().hex[:12]
        tags = json.dumps(["geotest", tmpl["category"], "secondhand"])
        img_id = listing_id
        image_url = f"https://picsum.photos/seed/{img_id}/600"
        image_urls = json.dumps([image_url])

        row = Listing(
            id=listing_id,
            user_id=seller_id,
            brand=tmpl["brand"],
            name=tmpl["name"],
            description=f"{tmpl['brand']} {tmpl['name']} in {tmpl['condition']} condition. Pickup in {neighborhood}.",
            price_cents=tmpl["price_cents"],
            condition=tmpl["condition"],
            condition_score=None,
            category=tmpl["category"],
            category_attributes="{}",
            tags=tags,
            communities="[]",
            visibility="public",
            status="open",
            image_url=image_url,
            image_urls=image_urls,
            pickup_location=neighborhood,
            location=neighborhood,
            latitude=round_coord(lat),
            longitude=round_coord(lng),
            zip_code=zip_code,
            posted_at=base_ts + i * 0.01,  # stagger slightly for stable ordering
        )
        rows.append((row, zip_code, seller_name))

    for row, _, _ in rows:
        db.add(row)
    db.commit()

    # Summary
    inserted = len(rows)
    print(f"\nInserted {inserted} geo-test listing(s).")
    print(f"\nZIP → distance from {REFERENCE_ZIP} spread:")
    printed_zips: set[str] = set()
    for _, zip_code, _ in rows:
        if zip_code not in printed_zips:
            dist = haversine_miles(ref_lat, ref_lng, *centroids[zip_code])
            print(f"  {zip_code}  ({NEIGHBORHOOD_BY_ZIP.get(zip_code, '?'):22s})  {dist:5.2f} mi from {REFERENCE_ZIP}")
            printed_zips.add(zip_code)

    print("\nSeller distribution:")
    seller_counts: dict[str, int] = {}
    for _, _, seller_name in rows:
        seller_counts[seller_name] = seller_counts.get(seller_name, 0) + 1
    for name, count in seller_counts.items():
        print(f"  {name}: {count} listing(s)")

    print(f"\nClean up anytime with:")
    print(f'  db.query(Listing).filter(Listing.tags.like(\'%"geotest"%\')).delete(synchronize_session=False)')


if __name__ == "__main__":
    main()
