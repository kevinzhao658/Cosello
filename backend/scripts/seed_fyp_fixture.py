"""Seed a representative listing fixture for FYP validation.

Inserts ~16 listings across three existing test users (Bob/John/Test) with
varied brand, category, community, and freshness so the FYP ranker has
something to rank.

Idempotent: every seeded row uses an `id` prefixed with `fypfix` and is
wiped at the start of each run. Manual cleanup:
    DELETE FROM listings WHERE id LIKE 'fypfix%';

Usage (from backend/):
    python3 scripts/seed_fyp_fixture.py

Run after backend tests pass; before any FYP browser-validation pass.
"""
from __future__ import annotations

import json
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

# Reuse existing on-disk uploads so cards render with images
IMAGES = [
    "/uploads/dced0b46418547a2bb66b8c9fc828a61.png",
    "/uploads/498194fdab4b460fa6b58e5b10201de1.png",
    "/uploads/c55646499f004ce19771b94713feefed.jpeg",
    "/uploads/eb930c05d05a4290bd51afd83b78a4f3.jpeg",
    "/uploads/994ca37bffae464ba9f5922545879965.jpeg",
    "/uploads/6a7aaaf290c641b5ae9ec926ed2f3b9d.jpeg",
    "/uploads/7f80b79f330c46d4ba78f8aeab8a2878.png",
    "/uploads/cd02f645385147239c32a6f5bc47f9b1.jpeg",
]

# Sellers (must already exist in users table)
BOB_ID = 2     # Murray Hill — Run Club, Burrito Club, Golf Club, PwC
JOHN_ID = 5    # Chelsea — Chelsea Chess Club, Run Club, Golf Club
TEST_ID = 4    # Chelsea — no communities

# Listing rows. `hours_old` controls freshness spread; communities are
# subsets of the seller's actual memberships.
LISTINGS: list[dict] = [
    # ---- Bob (Murray Hill, communities 3/4/5/6) ---- 6 rows
    {"seller": BOB_ID, "brand": "Nike",        "name": "Air Max 90 Running Shoes",     "category": "sports",      "tags": ["sneakers", "running", "nike"],          "price": 80,  "communities": ["neighborhood", 3, 5],    "hours_old": 6,   "image_idx": 0},
    {"seller": BOB_ID, "brand": "Apple",       "name": "iPhone 13 Pro 256GB",          "category": "electronics", "tags": ["iphone", "apple", "phone"],             "price": 400, "communities": ["neighborhood", 4, 6],    "hours_old": 14,  "image_idx": 5},
    {"seller": BOB_ID, "brand": "Apple",       "name": "AirPods Pro (2nd Gen)",        "category": "electronics", "tags": ["airpods", "apple"],                     "price": 120, "communities": ["neighborhood", 6],       "hours_old": 30,  "image_idx": 7},
    {"seller": BOB_ID, "brand": "Lululemon",   "name": "Align Leggings 25\"",          "category": "clothing",    "tags": ["leggings", "lululemon"],                "price": 50,  "communities": ["neighborhood", 3],       "hours_old": 50,  "image_idx": 2},
    {"seller": BOB_ID, "brand": "Levi's",      "name": "511 Slim Jeans",               "category": "clothing",    "tags": ["jeans", "denim", "levis"],              "price": 35,  "communities": ["neighborhood", 4],       "hours_old": 80,  "image_idx": 3},
    {"seller": BOB_ID, "brand": "Sony",        "name": "WH-1000XM4 Headphones",        "category": "electronics", "tags": ["headphones", "sony", "wireless"],       "price": 180, "communities": ["neighborhood", 6],       "hours_old": 110, "image_idx": 6},

    # ---- John (Chelsea, communities 2/3/5) ---- 6 rows
    {"seller": JOHN_ID, "brand": "Nike",       "name": "Pegasus 40 Running Shoes",     "category": "sports",      "tags": ["sneakers", "running", "nike"],          "price": 90,  "communities": ["neighborhood", 3, 5],    "hours_old": 10,  "image_idx": 1},
    {"seller": JOHN_ID, "brand": "Nike",       "name": "Dri-FIT Training T-Shirt",     "category": "clothing",    "tags": ["t-shirt", "nike", "training"],          "price": 20,  "communities": ["neighborhood", 3],       "hours_old": 24,  "image_idx": 4},
    {"seller": JOHN_ID, "brand": "Apple",      "name": "MacBook Air M2",               "category": "electronics", "tags": ["macbook", "apple", "laptop"],           "price": 700, "communities": ["neighborhood", 2],       "hours_old": 40,  "image_idx": 5},
    {"seller": JOHN_ID, "brand": "Lululemon",  "name": "Pace Breaker Shorts 7\"",      "category": "clothing",    "tags": ["shorts", "lululemon"],                  "price": 35,  "communities": ["neighborhood", 5],       "hours_old": 60,  "image_idx": 2},
    {"seller": JOHN_ID, "brand": "Bose",       "name": "QuietComfort 45 Headphones",   "category": "electronics", "tags": ["headphones", "bose"],                   "price": 200, "communities": ["neighborhood"],          "hours_old": 90,  "image_idx": 6},
    {"seller": JOHN_ID, "brand": "IKEA",       "name": "Bekant Sit/Stand Desk",        "category": "furniture",   "tags": ["desk", "ikea", "furniture"],            "price": 90,  "communities": ["neighborhood", 2],       "hours_old": 130, "image_idx": 0},

    # ---- Test (Chelsea, no communities) ---- 4 rows. communities=["neighborhood"] only
    {"seller": TEST_ID, "brand": "Nike",       "name": "Tech Fleece Hoodie",           "category": "clothing",    "tags": ["hoodie", "nike", "tech-fleece"],        "price": 60,  "communities": ["neighborhood"],          "hours_old": 18,  "image_idx": 4},
    {"seller": TEST_ID, "brand": "Levi's",     "name": "Trucker Denim Jacket",         "category": "clothing",    "tags": ["jacket", "denim", "levis"],             "price": 45,  "communities": ["neighborhood"],          "hours_old": 36,  "image_idx": 3},
    {"seller": TEST_ID, "brand": "Apple",      "name": "iPad Air 5th Gen",             "category": "electronics", "tags": ["ipad", "apple", "tablet"],              "price": 400, "communities": ["neighborhood"],          "hours_old": 70,  "image_idx": 7},
    {"seller": TEST_ID, "brand": "",           "name": "Canvas Gym Bag",               "category": "sports",      "tags": ["bag", "gym"],                           "price": 15,  "communities": ["neighborhood"],          "hours_old": 100, "image_idx": 1},
]


def main() -> None:
    db = SessionLocal()
    now = time.time()

    # Verify all seller users exist
    seller_ids = {row["seller"] for row in LISTINGS}
    found = {u.id: u for u in db.query(User).filter(User.id.in_(seller_ids)).all()}
    missing = seller_ids - set(found.keys())
    if missing:
        raise SystemExit(f"Missing seller users: {missing}. Aborting.")

    # Wipe prior fixture
    deleted = db.query(Listing).filter(Listing.id.like(f"{SEED_PREFIX}%")).delete(synchronize_session=False)
    db.commit()

    # Insert
    inserted = 0
    for row in LISTINGS:
        seller = found[row["seller"]]
        posted_at = now - row["hours_old"] * 3600.0
        listing_id = f"{SEED_PREFIX}{uuid.uuid4().hex[:6]}"
        image_url = IMAGES[row["image_idx"] % len(IMAGES)]
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
            image_url=image_url,
            image_urls=json.dumps([image_url]),
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

    print(f"Wiped {deleted} prior fixture rows.")
    print(f"Inserted {inserted} new fixture listings (id prefix '{SEED_PREFIX}').")
    print("Cleanup: DELETE FROM listings WHERE id LIKE 'fypfix%';")


if __name__ == "__main__":
    main()
