import json
import logging
import os
import random
import time
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env", override=True)

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from database import get_db
from models import User, Listing
from auth import get_current_user
from routers.auth import router as auth_router
from routers.circles import router as circles_router
from routers.communities import router as communities_router
from routers.events import router as events_router
from routers.friends import router as friends_router
from routers.notifications import router as notifications_router
from routers.orders import router as orders_router
from routers.searches import router as searches_router
from routers.listings import router as listings_router
from routers.wishlist import router as wishlist_router
from services.neighborhood import get_neighborhood_community

logger = logging.getLogger(__name__)

app = FastAPI()

_cors_allowed = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
_cors_origins = [o.strip() for o in _cors_allowed.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(auth_router)
app.include_router(circles_router)
app.include_router(communities_router)
app.include_router(events_router)
app.include_router(friends_router)
app.include_router(notifications_router)
app.include_router(orders_router)
app.include_router(searches_router)
app.include_router(listings_router)
app.include_router(wishlist_router)

# Legacy local-disk uploads directory. Pre-Phase 3 listings stored images here;
# everything new goes to Supabase Storage. On Vercel the runtime filesystem is
# read-only, so we skip the mkdir + StaticFiles mount when running there —
# nothing writes to this path in production anyway.
UPLOADS_DIR = Path(__file__).parent / "uploads"
if not os.getenv("VERCEL"):
    UPLOADS_DIR.mkdir(exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


# ---------------------------------------------------------------------------
# Backward-compatible re-exports for the test suite.
#
# Tests access these names via `main.<name>` or `from main import <name>`.
# The cache dicts are the SAME objects as in routers/listings.py — Python
# dict identity means clearing them via `main._walk_cache.clear()` clears
# the single live instance the router reads and writes.
# ---------------------------------------------------------------------------
from routers.listings import (  # noqa: E402
    _map_png_cache,
    _public_ids_cache,
    _walk_cache,
    _MAP_PNG_CACHE_MAX,
    _PUBLIC_IDS_TTL_S,
    _MAPBOX_TOKEN,
    LISTING_EXPIRY_SECONDS,
)
from services.listing_generation import (  # noqa: E402
    DESCRIPTION_VOICE_INSTRUCTIONS,
    RATIONALE_OPTIONS,
    _preprocess_image_bytes,
    _normalize_brand_hint,
    _rationale_value_line,
    _validate_groupings,
    format_title,
    client,
    vision,
)


# ---------------------------------------------------------------------------
# Dev-only seed endpoint — kept in main.py (dev convenience, not a real API).
# ---------------------------------------------------------------------------

LISTING_EXPIRY_SECONDS_SEED = 7 * 24 * 60 * 60  # local alias for seed function


@app.post("/api/dev/seed-listings")
def seed_listings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dev-only: seed the database with sample listings using existing uploaded images."""
    if os.getenv("VERCEL"):
        raise HTTPException(status_code=404, detail="Not Found")
    # Clear previous seed listings for this user to avoid duplicates
    db.query(Listing).filter(Listing.user_id == current_user.id).delete(synchronize_session=False)
    db.commit()

    upload_dir = Path(__file__).parent / "uploads"
    available_images = [f.name for f in upload_dir.iterdir() if f.suffix in (".jpeg", ".jpg", ".png")]
    if len(available_images) < 3:
        raise HTTPException(status_code=400, detail="Not enough images in uploads/")

    random.shuffle(available_images)

    sample_items = [
        {"brand": "Levi's", "name": "Vintage Denim Jacket", "description": "Classic 90s cut, minimal wear. Fits like a medium.", "price": "45", "condition": "Good", "tags": ["vintage", "denim", "jacket"], "category": "clothing", "category_attributes": {"size": "M", "gender": "Unisex"}},
        {"brand": "IKEA", "name": "BEKANT Standing Desk", "description": "BEKANT sit/stand desk, white top, electric height adjustment. Minor scuff on one corner.", "price": "120", "condition": "Good", "tags": ["furniture", "desk", "ikea"], "category": "furniture", "category_attributes": {"carry_difficulty": "Two people"}},
        {"brand": "Apple", "name": "AirPods Pro (2nd Gen)", "description": "Lightly used, includes original case and cable. Battery health still strong.", "price": "85", "condition": "Like New", "tags": ["electronics", "airpods", "apple"], "category": "electronics", "category_attributes": {}},
        {"brand": "Le Creuset", "name": "Dutch Oven", "description": "5.5 qt, flame orange. A few marks on the outside but cooks like new.", "price": "95", "condition": "Good", "tags": ["kitchen", "cookware", "le-creuset"], "category": "other", "category_attributes": {}},
        {"brand": "The North Face", "name": "Puffer Vest", "description": "Black, size L. Super warm, no rips or stains.", "price": "55", "condition": "Like New", "tags": ["clothing", "vest", "north-face"], "category": "clothing", "category_attributes": {"size": "L", "gender": "Unisex"}},
        {"brand": "Manduka", "name": "Pro Yoga Mat", "description": "6mm thick, charcoal. Used for about 3 months.", "price": "35", "condition": "Good", "tags": ["fitness", "yoga", "mat"], "category": "sports", "category_attributes": {}},
        {"brand": "Sonos", "name": "One Speaker", "description": "White, works perfectly. Includes power cable. Moving and need to downsize.", "price": "75", "condition": "Good", "tags": ["electronics", "speaker", "sonos"], "category": "electronics", "category_attributes": {}},
        {"brand": "Patagonia", "name": "Better Sweater Fleece Pullover", "description": "Better Sweater, size M, oatmeal color. Barely worn.", "price": "60", "condition": "Like New", "tags": ["clothing", "fleece", "patagonia"], "category": "clothing", "category_attributes": {"size": "M", "gender": "Unisex"}},
        {"brand": "Lodge", "name": "Cast Iron Skillet 12\"", "description": "Lodge pre-seasoned. Solid everyday pan, just upgraded to a bigger one.", "price": "20", "condition": "Fair", "tags": ["kitchen", "cookware", "cast-iron"], "category": "other", "category_attributes": {}},
        {"brand": "Amazon", "name": "Kindle Paperwhite 2022", "description": "2022 model, 8GB, no ads. Screen is perfect. Comes with a leather case.", "price": "70", "condition": "Like New", "tags": ["electronics", "kindle", "amazon"], "category": "electronics", "category_attributes": {}},
        {"brand": "", "name": "Mid-Century Side Table", "description": "Walnut finish, tapered legs. Small ring mark on top but barely noticeable.", "price": "40", "condition": "Fair", "tags": ["furniture", "table", "mid-century"], "category": "furniture", "category_attributes": {"carry_difficulty": "One person"}},
        {"brand": "Nike", "name": "Pegasus 40 Running Shoes", "description": "Size 10, about 50 miles on them. Still plenty of life.", "price": "45", "condition": "Good", "tags": ["shoes", "running", "nike"], "category": "sports", "category_attributes": {"size": "10"}},
    ]

    neighborhoods = ["Chelsea", "Murray Hill", "East Village", "West Village", "SoHo", "Tribeca", "UES", "UWS"]

    created = []
    for i, item in enumerate(sample_items):
        imgs = available_images[i * 2 : i * 2 + 2] if i * 2 + 2 <= len(available_images) else [available_images[i % len(available_images)]]
        image_urls = [f"/uploads/{img}" for img in imgs]

        seed_posted_at = time.time() - random.randint(0, 86400 * 3)
        listing = Listing(
            id=uuid.uuid4().hex[:12],
            user_id=current_user.id,
            brand=item.get("brand", ""),
            name=item.get("name", ""),
            description=item["description"],
            price_cents=int(round(float(item["price"]) * 100)),
            condition=item["condition"],
            location=current_user.neighborhood or random.choice(neighborhoods),
            tags=json.dumps(item["tags"]),
            communities=json.dumps(
                [get_neighborhood_community(db, current_user.neighborhood).id]
                if current_user.neighborhood
                else []
            ),
            visibility="public",
            image_url=image_urls[0],
            image_urls=json.dumps(image_urls),
            pickup_location=current_user.pickup_address or "",
            category=item.get("category", "other"),
            category_attributes=json.dumps(item.get("category_attributes", {})),
            status="open",
            posted_at=seed_posted_at,
            original_posted_at=seed_posted_at,
            relist_count=0,
        )
        db.add(listing)
        created.append({"id": listing.id, "title": listing.title_str})

    db.commit()
    return {"seeded": len(created), "listings": created}
