"""Seed a representative listing fixture for FYP validation.

Inserts ~16 listings across three existing test users (Bob/John/Test) with
varied brand, category, community, and freshness so the FYP ranker has
something to rank.

Idempotent: every seeded row uses an `id` prefixed with `fypfix` and is
wiped at the start of each run, along with any `fypfix-*` files in
`backend/uploads/`. Manual cleanup:
    DELETE FROM listings WHERE id LIKE 'fypfix%';
    rm backend/uploads/fypfix-*

Per-listing images:
    Drop curated product photos into `backend/scripts/fixture_images/`
    using the filenames in each row's `image` field (e.g. `nike_air_max_90.jpg`).
    On seed, the script copies each fixture into `backend/uploads/` with a
    `fypfix-` prefix so the existing static mount serves it. Rows whose
    fixture file is missing fall back to PLACEHOLDER_IMAGE — partial-image
    states are safe.

Usage (from backend/):
    python3 scripts/seed_fyp_fixture.py

Run after backend tests pass; before any FYP browser-validation pass.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import time
import uuid
from pathlib import Path

# Make the backend package importable when invoked as a script
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal  # noqa: E402
from models import Listing, User  # noqa: E402


SEED_PREFIX = "fypfix"
FIXTURE_FILE_PREFIX = "fypfix-"
FIXTURE_IMAGES_DIR = Path(__file__).resolve().parent / "fixture_images"
UPLOADS_DIR = BACKEND_DIR / "uploads"

# Fallback used when a row's fixture image is missing from fixture_images/.
# Lets the script remain robust to partial-image states.
PLACEHOLDER_IMAGE = "/uploads/dced0b46418547a2bb66b8c9fc828a61.png"

# Sellers (must already exist in users table)
BOB_ID = 2     # Murray Hill — Run Club, Burrito Club, Golf Club, PwC
JOHN_ID = 5    # Chelsea — Chelsea Chess Club, Run Club, Golf Club
TEST_ID = 4    # Chelsea — no communities

# Listing rows. `hours_old` controls freshness spread; communities are
# subsets of the seller's actual memberships. `image` is the filename in
# fixture_images/ — missing files fall back to PLACEHOLDER_IMAGE.
LISTINGS: list[dict] = [
    # ---- Bob (Murray Hill, communities 3/4/5/6) ---- 6 rows
    {"seller": BOB_ID, "brand": "Nike",        "name": "Air Max 90 Running Shoes",     "category": "sports",      "tags": ["sneakers", "running", "nike"],          "price": 80,  "communities": ["neighborhood", 3, 5],    "hours_old": 6,   "image": "nike_air_max_90.jpg"},
    {"seller": BOB_ID, "brand": "Apple",       "name": "iPhone 13 Pro 256GB",          "category": "electronics", "tags": ["iphone", "apple", "phone"],             "price": 400, "communities": ["neighborhood", 4, 6],    "hours_old": 14,  "image": "iphone_13_pro.jpg"},
    {"seller": BOB_ID, "brand": "Apple",       "name": "AirPods Pro (2nd Gen)",        "category": "electronics", "tags": ["airpods", "apple"],                     "price": 120, "communities": ["neighborhood", 6],       "hours_old": 30,  "image": "airpods_pro_2.jpg"},
    {"seller": BOB_ID, "brand": "Lululemon",   "name": "Align Leggings 25\"",          "category": "clothing",    "tags": ["leggings", "lululemon"],                "price": 50,  "communities": ["neighborhood", 3],       "hours_old": 50,  "image": "lululemon_align_leggings.jpg"},
    {"seller": BOB_ID, "brand": "Levi's",      "name": "511 Slim Jeans",               "category": "clothing",    "tags": ["jeans", "denim", "levis"],              "price": 35,  "communities": ["neighborhood", 4],       "hours_old": 80,  "image": "levis_511_jeans.jpg"},
    {"seller": BOB_ID, "brand": "Sony",        "name": "WH-1000XM4 Headphones",        "category": "electronics", "tags": ["headphones", "sony", "wireless"],       "price": 180, "communities": ["neighborhood", 6],       "hours_old": 110, "image": "sony_wh1000xm4.jpg"},

    # ---- John (Chelsea, communities 2/3/5) ---- 6 rows
    {"seller": JOHN_ID, "brand": "Nike",       "name": "Pegasus 40 Running Shoes",     "category": "sports",      "tags": ["sneakers", "running", "nike"],          "price": 90,  "communities": ["neighborhood", 3, 5],    "hours_old": 10,  "image": "nike_pegasus_40.jpg"},
    {"seller": JOHN_ID, "brand": "Nike",       "name": "Dri-FIT Training T-Shirt",     "category": "clothing",    "tags": ["t-shirt", "nike", "training"],          "price": 20,  "communities": ["neighborhood", 3],       "hours_old": 24,  "image": "nike_drifit_tshirt.jpg"},
    {"seller": JOHN_ID, "brand": "Apple",      "name": "MacBook Air M2",               "category": "electronics", "tags": ["macbook", "apple", "laptop"],           "price": 700, "communities": ["neighborhood", 2],       "hours_old": 40,  "image": "macbook_air_m2.jpg"},
    {"seller": JOHN_ID, "brand": "Lululemon",  "name": "Pace Breaker Shorts 7\"",      "category": "clothing",    "tags": ["shorts", "lululemon"],                  "price": 35,  "communities": ["neighborhood", 5],       "hours_old": 60,  "image": "lululemon_pace_breaker.jpg"},
    {"seller": JOHN_ID, "brand": "Bose",       "name": "QuietComfort 45 Headphones",   "category": "electronics", "tags": ["headphones", "bose"],                   "price": 200, "communities": ["neighborhood"],          "hours_old": 90,  "image": "bose_qc45.jpg"},
    {"seller": JOHN_ID, "brand": "IKEA",       "name": "Bekant Sit/Stand Desk",        "category": "furniture",   "tags": ["desk", "ikea", "furniture"],            "price": 90,  "communities": ["neighborhood", 2],       "hours_old": 130, "image": "ikea_bekant_desk.jpg"},

    # ---- Test (Chelsea, no communities) ---- 4 rows. communities=["neighborhood"] only
    {"seller": TEST_ID, "brand": "Nike",       "name": "Tech Fleece Hoodie",           "category": "clothing",    "tags": ["hoodie", "nike", "tech-fleece"],        "price": 60,  "communities": ["neighborhood"],          "hours_old": 18,  "image": "nike_tech_fleece.jpg"},
    {"seller": TEST_ID, "brand": "Levi's",     "name": "Trucker Denim Jacket",         "category": "clothing",    "tags": ["jacket", "denim", "levis"],             "price": 45,  "communities": ["neighborhood"],          "hours_old": 36,  "image": "levis_trucker_jacket.jpg"},
    {"seller": TEST_ID, "brand": "Apple",      "name": "iPad Air 5th Gen",             "category": "electronics", "tags": ["ipad", "apple", "tablet"],              "price": 400, "communities": ["neighborhood"],          "hours_old": 70,  "image": "ipad_air_5.jpg"},
    {"seller": TEST_ID, "brand": "",           "name": "Canvas Gym Bag",               "category": "sports",      "tags": ["bag", "gym"],                           "price": 15,  "communities": ["neighborhood"],          "hours_old": 100, "image": "canvas_gym_bag.jpg"},
]


def _resolve_image_urls(image_filename: str) -> list[str]:
    """Find every fixture matching image_filename + its `_N` variants, copy
    each into uploads/ with a fypfix- prefix, and return the list of URLs.

    The bare filename sorts first; numeric suffix variants sort by N.
    Returns [PLACEHOLDER_IMAGE] when nothing matches — keeps the seeder
    robust to partial-image states.

    Example: image="airpods_pro_2.jpg" with files
        airpods_pro_2_1.jpg, airpods_pro_2_2.jpg
    yields ["/uploads/fypfix-airpods_pro_2_1.jpg",
            "/uploads/fypfix-airpods_pro_2_2.jpg"].
    """
    src_path = FIXTURE_IMAGES_DIR / image_filename
    stem = src_path.stem
    ext = src_path.suffix
    # Match either the bare stem or `<stem>_<digits>`.
    pattern = re.compile(rf"^{re.escape(stem)}(?:_(\d+))?{re.escape(ext)}$")

    matches: list[tuple[int, Path]] = []
    if FIXTURE_IMAGES_DIR.is_dir():
        for f in FIXTURE_IMAGES_DIR.iterdir():
            if not f.is_file():
                continue
            m = pattern.match(f.name)
            if not m:
                continue
            # Bare file (no `_N` suffix) sorts as 0; variants sort by N.
            idx = int(m.group(1)) if m.group(1) is not None else 0
            matches.append((idx, f))

    if not matches:
        return [PLACEHOLDER_IMAGE]

    matches.sort(key=lambda x: x[0])
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    urls: list[str] = []
    for _, src in matches:
        dest_name = f"{FIXTURE_FILE_PREFIX}{src.name}"
        shutil.copy2(src, UPLOADS_DIR / dest_name)
        urls.append(f"/uploads/{dest_name}")
    return urls


def _wipe_fixture_image_files() -> int:
    """Remove any fypfix-* files from uploads/. Counterpart to the DB wipe."""
    if not UPLOADS_DIR.is_dir():
        return 0
    removed = 0
    for path in UPLOADS_DIR.glob(f"{FIXTURE_FILE_PREFIX}*"):
        if path.is_file():
            path.unlink()
            removed += 1
    return removed


def main() -> None:
    db = SessionLocal()
    now = time.time()

    # Verify all seller users exist
    seller_ids = {row["seller"] for row in LISTINGS}
    found = {u.id: u for u in db.query(User).filter(User.id.in_(seller_ids)).all()}
    missing = seller_ids - set(found.keys())
    if missing:
        raise SystemExit(f"Missing seller users: {missing}. Aborting.")

    # Wipe prior fixture — DB rows + uploaded fixture images
    deleted = db.query(Listing).filter(Listing.id.like(f"{SEED_PREFIX}%")).delete(synchronize_session=False)
    db.commit()
    removed_files = _wipe_fixture_image_files()

    # Insert
    inserted = 0
    matched_listings = 0
    matched_files = 0
    for row in LISTINGS:
        seller = found[row["seller"]]
        posted_at = now - row["hours_old"] * 3600.0
        listing_id = f"{SEED_PREFIX}{uuid.uuid4().hex[:6]}"
        urls = _resolve_image_urls(row["image"])
        if urls != [PLACEHOLDER_IMAGE]:
            matched_listings += 1
            matched_files += len(urls)
        listing = Listing(
            id=listing_id,
            user_id=seller.id,
            brand=row["brand"],
            name=row["name"],
            description=f"FYP fixture seed listing — {row['name']}",
            price_cents=int(row["price"] * 100),
            condition="Good",
            location=seller.neighborhood or "",
            tags=json.dumps(row["tags"]),
            communities=json.dumps(row["communities"]),
            visibility="public",
            image_url=urls[0],
            image_urls=json.dumps(urls),
            pickup_location=seller.pickup_address or "",
            category=row["category"],
            category_attributes=json.dumps({}),
            status="open",
            posted_at=posted_at,
            original_posted_at=posted_at,
            relist_count=0,
        )
        db.add(listing)
        inserted += 1

    db.commit()
    db.close()

    print(f"Wiped {deleted} prior fixture rows and {removed_files} prior fixture image files.")
    print(f"Inserted {inserted} new fixture listings (id prefix '{SEED_PREFIX}').")
    print(f"Matched {matched_listings}/{inserted} listings to curated images "
          f"({matched_files} total image files copied); remaining "
          f"{inserted - matched_listings} fell back to the placeholder.")
    print("Cleanup: DELETE FROM listings WHERE id LIKE 'fypfix%'; rm backend/uploads/fypfix-*")


if __name__ == "__main__":
    main()
