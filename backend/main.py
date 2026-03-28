import base64
import io
import json
import os
import time
import uuid
from pathlib import Path
from typing import Optional

import anthropic
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import User, Community, CommunityMember, WishlistItem, PurchaseOrder, Notification
from auth import get_current_user
from routers.auth import router as auth_router
from routers.communities import router as communities_router
from routers.friends import router as friends_router
from routers.notifications import router as notifications_router
from routers.orders import router as orders_router

# Create tables
Base.metadata.create_all(bind=engine)

# Migrate: add missing columns to existing tables
with engine.connect() as conn:
    from sqlalchemy import text, inspect
    inspector = inspect(engine)

    # Add related_user_id, listing_id to notifications if missing
    if "notifications" in inspector.get_table_names():
        cols = [c["name"] for c in inspector.get_columns("notifications")]
        if "related_user_id" not in cols:
            conn.execute(text("ALTER TABLE notifications ADD COLUMN related_user_id INTEGER REFERENCES users(id)"))
            conn.commit()
        if "listing_id" not in cols:
            conn.execute(text("ALTER TABLE notifications ADD COLUMN listing_id VARCHAR(20)"))
            conn.commit()

    # Add pickup_address, zip_code to users if missing
    if "users" in inspector.get_table_names():
        cols = [c["name"] for c in inspector.get_columns("users")]
        if "pickup_address" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN pickup_address VARCHAR(255)"))
            conn.commit()
        if "zip_code" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN zip_code VARCHAR(10)"))
            conn.commit()

    # Add buyer_reviewed, seller_reviewed, pickup_address, address_released to purchase_orders if missing
    if "purchase_orders" in inspector.get_table_names():
        cols = [c["name"] for c in inspector.get_columns("purchase_orders")]
        if "buyer_reviewed" not in cols:
            conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN buyer_reviewed BOOLEAN DEFAULT 0"))
            conn.commit()
        if "seller_reviewed" not in cols:
            conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN seller_reviewed BOOLEAN DEFAULT 0"))
            conn.commit()
        if "pickup_address" not in cols:
            conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN pickup_address VARCHAR(255)"))
            conn.commit()
        if "address_released" not in cols:
            conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN address_released INTEGER DEFAULT 0"))
            conn.commit()
        if "confirmed_time" not in cols:
            conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN confirmed_time VARCHAR(20)"))
            conn.commit()
        if "pickup_notified" not in cols:
            conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN pickup_notified INTEGER DEFAULT 0"))
            conn.commit()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(auth_router)
app.include_router(communities_router)
app.include_router(friends_router)
app.include_router(notifications_router)
app.include_router(orders_router)

# Create uploads directory
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

from listings_store import listings_db
import random

LISTING_EXPIRY_SECONDS = 7 * 24 * 60 * 60  # 7 days


@app.post("/api/dev/seed-listings")
async def seed_listings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dev-only: seed the in-memory store with sample listings using existing uploaded images."""
    upload_dir = Path(__file__).parent / "uploads"
    available_images = [f.name for f in upload_dir.iterdir() if f.suffix in (".jpeg", ".jpg", ".png")]
    if len(available_images) < 3:
        raise HTTPException(status_code=400, detail="Not enough images in uploads/")

    random.shuffle(available_images)

    sample_items = [
        {"title": "Vintage Denim Jacket", "description": "Classic 90s cut, minimal wear. Fits like a medium.", "price": "45", "condition": "Good", "tags": ["vintage", "denim", "jacket"]},
        {"title": "IKEA Standing Desk", "description": "BEKANT sit/stand desk, white top, electric height adjustment. Minor scuff on one corner.", "price": "120", "condition": "Good", "tags": ["furniture", "desk", "ikea"]},
        {"title": "AirPods Pro (2nd Gen)", "description": "Lightly used, includes original case and cable. Battery health still strong.", "price": "85", "condition": "Like New", "tags": ["electronics", "airpods", "apple"]},
        {"title": "Le Creuset Dutch Oven", "description": "5.5 qt, flame orange. A few marks on the outside but cooks like new.", "price": "95", "condition": "Good", "tags": ["kitchen", "cookware", "le-creuset"]},
        {"title": "North Face Puffer Vest", "description": "Black, size L. Super warm, no rips or stains.", "price": "55", "condition": "Like New", "tags": ["clothing", "vest", "north-face"]},
        {"title": "Yoga Mat — Manduka Pro", "description": "6mm thick, charcoal. Used for about 3 months.", "price": "35", "condition": "Good", "tags": ["fitness", "yoga", "mat"]},
        {"title": "Sonos One Speaker", "description": "White, works perfectly. Includes power cable. Moving and need to downsize.", "price": "75", "condition": "Good", "tags": ["electronics", "speaker", "sonos"]},
        {"title": "Patagonia Fleece Pullover", "description": "Better Sweater, size M, oatmeal color. Barely worn.", "price": "60", "condition": "Like New", "tags": ["clothing", "fleece", "patagonia"]},
        {"title": "Cast Iron Skillet 12\"", "description": "Lodge pre-seasoned. Solid everyday pan, just upgraded to a bigger one.", "price": "20", "condition": "Fair", "tags": ["kitchen", "cookware", "cast-iron"]},
        {"title": "Kindle Paperwhite", "description": "2022 model, 8GB, no ads. Screen is perfect. Comes with a leather case.", "price": "70", "condition": "Like New", "tags": ["electronics", "kindle", "amazon"]},
        {"title": "Mid-Century Side Table", "description": "Walnut finish, tapered legs. Small ring mark on top but barely noticeable.", "price": "40", "condition": "Fair", "tags": ["furniture", "table", "mid-century"]},
        {"title": "Running Shoes — Nike Pegasus 40", "description": "Size 10, about 50 miles on them. Still plenty of life.", "price": "45", "condition": "Good", "tags": ["shoes", "running", "nike"]},
    ]

    neighborhoods = ["Chelsea", "Murray Hill", "East Village", "West Village", "SoHo", "Tribeca", "UES", "UWS"]

    created = []
    for i, item in enumerate(sample_items):
        imgs = available_images[i * 2 : i * 2 + 2] if i * 2 + 2 <= len(available_images) else [available_images[i % len(available_images)]]
        image_urls = [f"/uploads/{img}" for img in imgs]

        listing = {
            "id": uuid.uuid4().hex[:12],
            "userId": current_user.id,
            "title": item["title"],
            "description": item["description"],
            "price": item["price"],
            "condition": item["condition"],
            "location": current_user.neighborhood or random.choice(neighborhoods),
            "tags": item["tags"],
            "communities": ["neighborhood"],
            "visibility": "public",
            "imageUrl": image_urls[0],
            "imageUrls": image_urls,
            "pickup_location": current_user.pickup_address or "",
            "status": "open",
            "postedAt": time.time() - random.randint(0, 86400 * 3),
        }
        listings_db.insert(0, listing)
        created.append({"id": listing["id"], "title": listing["title"]})

    return {"seeded": len(created), "listings": created}


@app.post("/api/generate-listing")
async def generate_listing(images: list[UploadFile] = File(...)):
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    # Build image content blocks for Claude (resize if over 4MB)
    MAX_BYTES = 4 * 1024 * 1024  # 4MB to stay safely under Claude's 5MB limit
    MAX_DIMENSION = 2048

    content = []
    for img in images:
        data = await img.read()

        # Resize large images
        if len(data) > MAX_BYTES:
            pil_img = Image.open(io.BytesIO(data))
            pil_img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=85)
            data = buf.getvalue()
            media_type = "image/jpeg"
        else:
            media_type = img.content_type or "image/jpeg"

        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64.b64encode(data).decode("utf-8"),
            },
        })

    content.append({
        "type": "text",
        "text": (
            "You are a product listing assistant for a neighborhood marketplace. "
            "Analyze the product image(s) and generate a listing. "
            "Return ONLY valid JSON with these exact fields:\n"
            "{\n"
            '  "title": "short product title",\n'
            '  "description": "2-3 sentence description highlighting key features and condition",\n'
            '  "price": "estimated fair market price as a number string like 85.00",\n'
            '  "condition": "one of: New, Like New, Good, Fair, Poor",\n'
            '  "location": "suggest a Manhattan neighborhood",\n'
            '  "tags": ["3-5 short relevant tags like Electronics, Vintage, Nike, etc."]\n'
            "}\n"
            "Be realistic with pricing. No markdown, no code fences, just the JSON object."
        ),
    })

    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=512,
            messages=[{"role": "user", "content": content}],
        )

        raw = response.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]  # remove first line (```json)
            raw = raw.rsplit("```", 1)[0]  # remove closing ```
            raw = raw.strip()
        # Parse to validate it's real JSON, then return
        listing = json.loads(raw)
        return listing

    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e.message}")


@app.post("/api/generate-bulk-listing")
async def generate_bulk_listing(images: list[UploadFile] = File(...)):
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    MAX_BYTES = 4 * 1024 * 1024
    MAX_DIMENSION = 2048

    content = []
    for idx, img in enumerate(images):
        data = await img.read()

        if len(data) > MAX_BYTES:
            pil_img = Image.open(io.BytesIO(data))
            pil_img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=85)
            data = buf.getvalue()
            media_type = "image/jpeg"
        else:
            media_type = img.content_type or "image/jpeg"

        content.append({"type": "text", "text": f"[Image {idx}]"})
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64.b64encode(data).decode("utf-8"),
            },
        })

    content.append({
        "type": "text",
        "text": (
            "You are a product listing assistant for a neighborhood marketplace. "
            "The user has uploaded multiple photos that may contain MULTIPLE DIFFERENT items for sale. "
            "Some photos may show the same item from different angles.\n\n"
            "Your task:\n"
            "1. Identify each distinct item across all photos\n"
            "2. Group photos that show the same item together\n"
            "3. Generate a listing for each distinct item\n\n"
            "Return ONLY valid JSON — an array of objects. Each object must have:\n"
            "{\n"
            '  "title": "short product title",\n'
            '  "description": "2-3 sentence description highlighting key features and condition",\n'
            '  "price": "estimated fair market price as a number string like 85.00",\n'
            '  "condition": "one of: New, Like New, Good, Fair, Poor",\n'
            '  "location": "suggest a Manhattan neighborhood",\n'
            '  "tags": ["3-5 short relevant tags"],\n'
            '  "imageIndices": [0, 1]  // which image indices (0-based) belong to this item\n'
            "}\n\n"
            "Important: Every image index must appear in exactly one item's imageIndices array. "
            "Be realistic with pricing. No markdown, no code fences, just the JSON array."
        ),
    })

    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=2048,
            messages=[{"role": "user", "content": content}],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]
            raw = raw.strip()
        items = json.loads(raw)

        if isinstance(items, dict):
            items = [items]

        return items

    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e.message}")


@app.post("/api/regenerate-bulk-listing")
async def regenerate_bulk_listing(
    images: list[UploadFile] = File(...),
    groupings: str = Form(...),
):
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    groups = json.loads(groupings)  # list of lists of image indices

    MAX_BYTES = 4 * 1024 * 1024
    MAX_DIMENSION = 2048

    content = []
    for idx, img in enumerate(images):
        data = await img.read()
        if len(data) > MAX_BYTES:
            pil_img = Image.open(io.BytesIO(data))
            pil_img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=85)
            data = buf.getvalue()
            media_type = "image/jpeg"
        else:
            media_type = img.content_type or "image/jpeg"

        content.append({"type": "text", "text": f"[Image {idx}]"})
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64.b64encode(data).decode("utf-8"),
            },
        })

    groups_desc = "\n".join(
        f"Item {i + 1}: images {g}" for i, g in enumerate(groups)
    )

    content.append({
        "type": "text",
        "text": (
            "You are a product listing assistant for a neighborhood marketplace. "
            "The user has uploaded photos and has already grouped them into items. "
            "Use the groupings below exactly as provided — do NOT change the groupings.\n\n"
            f"Groupings:\n{groups_desc}\n\n"
            "For each group, generate a listing. "
            "Return ONLY valid JSON — an array of objects in the same order as the groups. Each object must have:\n"
            "{\n"
            '  "title": "short product title",\n'
            '  "description": "2-3 sentence description highlighting key features and condition",\n'
            '  "price": "estimated fair market price as a number string like 85.00",\n'
            '  "condition": "one of: New, Like New, Good, Fair, Poor",\n'
            '  "location": "suggest a Manhattan neighborhood",\n'
            '  "tags": ["3-5 short relevant tags"],\n'
            '  "imageIndices": [0, 1]  // the exact image indices from the grouping above\n'
            "}\n\n"
            "Be realistic with pricing. No markdown, no code fences, just the JSON array."
        ),
    })

    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=2048,
            messages=[{"role": "user", "content": content}],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]
            raw = raw.strip()
        items = json.loads(raw)

        if isinstance(items, dict):
            items = [items]

        return items

    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e.message}")


@app.post("/api/listings")
async def create_listing(
    images: list[UploadFile] = File(...),
    data: str = Form(...),
    communities: str = Form(""),
    visibility: str = Form("public"),
    pickup_location: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Parse the JSON product details
    try:
        details = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in data field")

    if visibility not in ("public", "private"):
        raise HTTPException(status_code=400, detail="visibility must be 'public' or 'private'")

    # Parse community IDs the listing is posted to
    community_ids: list = []
    if communities:
        for part in communities.split(","):
            part = part.strip()
            if part == "neighborhood":
                community_ids.append("neighborhood")
            elif part:
                try:
                    community_ids.append(int(part))
                except ValueError:
                    pass

    # Validate community selection against visibility
    if visibility == "public":
        # Auto-attach user's public community memberships + neighborhood
        community_ids = []
        if current_user.neighborhood:
            community_ids.append("neighborhood")
        memberships = db.query(CommunityMember).filter(
            CommunityMember.user_id == current_user.id
        ).all()
        for m in memberships:
            comm = db.query(Community).filter(Community.id == m.community_id).first()
            if comm and comm.is_public:
                community_ids.append(comm.id)
    else:
        if len(community_ids) == 0:
            raise HTTPException(status_code=400, detail="Private listing must have at least one community")
        for cid in community_ids:
            if cid == "neighborhood":
                raise HTTPException(status_code=400, detail="Neighborhood is a public community")
            comm = db.query(Community).filter(Community.id == cid).first()
            if not comm or comm.is_public:
                raise HTTPException(status_code=400, detail=f"Community {cid} is not private")
            if not db.query(CommunityMember).filter(
                CommunityMember.community_id == cid,
                CommunityMember.user_id == current_user.id,
            ).first():
                raise HTTPException(status_code=400, detail=f"You are not a member of community {cid}")

    # Save all uploaded images to disk
    image_urls: list[str] = []
    for img in images:
        ext = img.filename.rsplit(".", 1)[-1] if img.filename and "." in img.filename else "jpg"
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = UPLOADS_DIR / filename
        contents = await img.read()
        filepath.write_bytes(contents)
        image_urls.append(f"/uploads/{filename}")

    listing = {
        "id": uuid.uuid4().hex[:12],
        "userId": current_user.id,
        "title": details.get("title", ""),
        "description": details.get("description", ""),
        "price": details.get("price", "0"),
        "condition": details.get("condition", "Good"),
        "location": current_user.neighborhood or details.get("location", ""),
        "tags": details.get("tags", []),
        "communities": community_ids,
        "visibility": visibility,
        "imageUrl": image_urls[0],
        "imageUrls": image_urls,
        "pickup_location": pickup_location or current_user.pickup_address or "",
        "status": "open",
        "postedAt": time.time(),
    }

    listings_db.insert(0, listing)
    return listing


@app.get("/api/listings")
async def get_listings(
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    community: Optional[str] = Query(None),
    neighborhood: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = time.time()
    results = [l for l in listings_db if now - l.get("postedAt", 0) < LISTING_EXPIRY_SECONDS and l.get("status") != "sold"]

    all_public_ids: set[int] = {
        c.id for c in db.query(Community).filter(Community.is_public == True).all()
    }
    my_community_ids: set[int] = {
        m.community_id
        for m in db.query(CommunityMember).filter(CommunityMember.user_id == current_user.id).all()
    }
    my_neighborhood = current_user.neighborhood

    # Batch-fetch poster user records for neighborhood checks
    poster_ids = {l.get("userId") for l in results if l.get("userId")}
    poster_map: dict[int, User] = {}
    if poster_ids:
        poster_map = {u.id: u for u in db.query(User).filter(User.id.in_(poster_ids)).all()}

    def _ncid(cid):
        if isinstance(cid, int):
            return cid
        if isinstance(cid, str) and cid.isdigit():
            return int(cid)
        return cid

    def _infer_visibility(listing: dict) -> str:
        v = listing.get("visibility")
        if v:
            return v
        lc = listing.get("communities", [])
        if not lc:
            return "public"
        for c in lc:
            nc = _ncid(c)
            if nc == "neighborhood" or (isinstance(nc, int) and nc in all_public_ids):
                return "public"
        return "private"

    def _is_visible(listing: dict) -> bool:
        lc = listing.get("communities", [])
        if not lc:
            return True
        vis = _infer_visibility(listing)
        if vis == "public":
            # All public listings are visible (including neighborhood listings
            # from other neighborhoods — they just rank lower via _tier)
            return True
        else:
            # Private listings only visible to members
            for c in lc:
                nc = _ncid(c)
                if isinstance(nc, int) and nc in my_community_ids:
                    return True
            return False

    def _tier(listing: dict) -> int:
        """Tier 1: user's private communities. Tier 2: user's public/neighborhood. Tier 3: other public."""
        vis = _infer_visibility(listing)
        if vis == "private":
            for c in listing.get("communities", []):
                nc = _ncid(c)
                if isinstance(nc, int) and nc in my_community_ids:
                    return 1
            return 3
        for c in listing.get("communities", []):
            nc = _ncid(c)
            if nc == "neighborhood":
                poster = poster_map.get(listing.get("userId"))
                if poster and my_neighborhood and poster.neighborhood == my_neighborhood:
                    return 2
            elif isinstance(nc, int) and nc in my_community_ids:
                return 2
        return 3

    # --- Filtering ---
    if community and community != "All":
        parts = [c.strip() for c in community.split(",") if c.strip()]
        filtered: list[dict] = []
        for listing in results:
            lc = listing.get("communities", [])
            norm_cids = [_ncid(c) for c in lc]
            for part in parts:
                if part == "neighborhood":
                    if "neighborhood" in lc and neighborhood:
                        poster = poster_map.get(listing.get("userId"))
                        if poster and poster.neighborhood == neighborhood:
                            filtered.append(listing)
                            break
                else:
                    try:
                        cid = int(part)
                    except ValueError:
                        continue
                    if cid not in norm_cids:
                        continue
                    if cid in my_community_ids or cid in all_public_ids:
                        filtered.append(listing)
                        break
        results = filtered
    else:
        results = [l for l in results if _is_visible(l)]

    # --- Search ---
    if search:
        q = search.lower()
        results = [
            l for l in results
            if q in l["title"].lower() or q in l["description"].lower()
            or any(q in t.lower() for t in l.get("tags", []))
        ]

        def _relevance(l: dict):
            title = l.get("title", "").lower()
            if title == q:
                ts = 0
            elif title.startswith(q):
                ts = 1
            elif q in title:
                ts = 2
            else:
                ts = 3
            return (ts, _tier(l), -l.get("postedAt", 0))

        results.sort(key=_relevance)
    else:
        # --- Sort with tier ranking ---
        if sort == "price_low":
            results.sort(key=lambda l: (_tier(l), float(l.get("price", 0))))
        elif sort == "price_high":
            results.sort(key=lambda l: (_tier(l), -float(l.get("price", 0))))
        else:
            results.sort(key=lambda l: (_tier(l), -l.get("postedAt", 0)))

    # Filter by tag
    if tag and tag != "All":
        results = [
            l for l in results
            if tag.lower() in [t.lower() for t in l.get("tags", [])]
        ]

    # --- Enrich response ---
    all_community_ids_set: set[int] = set()
    for l in results:
        for cid in l.get("communities", []):
            if isinstance(cid, int):
                all_community_ids_set.add(cid)
    community_info_map: dict[int, dict] = {}
    if all_community_ids_set:
        for c in db.query(Community).filter(Community.id.in_(all_community_ids_set)).all():
            community_info_map[c.id] = {"name": c.name, "is_public": c.is_public}

    enriched = []
    for l in results:
        listing_copy = dict(l)
        listing_copy["visibility"] = _infer_visibility(l)
        listing_copy["tier"] = _tier(l)
        poster = poster_map.get(l.get("userId"))
        listing_copy["seller_name"] = poster.display_name if poster else None
        listing_copy["seller_picture"] = poster.profile_picture if poster else None
        if poster and poster.neighborhood:
            listing_copy["location"] = poster.neighborhood
            l["location"] = poster.neighborhood
        all_comms = []
        mutual = []
        for cid in l.get("communities", []):
            if cid == "neighborhood":
                poster = poster_map.get(l.get("userId"))
                hood_name = poster.neighborhood if poster and poster.neighborhood else l.get("location", "Neighborhood")
                is_same_hood = bool(poster and my_neighborhood and poster.neighborhood == my_neighborhood)
                hood_entry = {"name": hood_name, "is_public": True, "is_mutual": is_same_hood, "is_neighborhood": True}
                all_comms.append(hood_entry)
                if is_same_hood:
                    mutual.append(hood_entry)
            elif isinstance(cid, int) and cid in community_info_map:
                info = community_info_map[cid]
                is_mutual = cid in my_community_ids
                all_comms.append({**info, "is_mutual": is_mutual})
                if is_mutual:
                    mutual.append(info)
        all_comms.sort(key=lambda c: (not c["is_mutual"], c["name"]))
        listing_copy["mutualCommunityNames"] = [m["name"] for m in mutual]
        listing_copy["mutualCommunities"] = mutual
        listing_copy["allCommunities"] = all_comms
        enriched.append(listing_copy)
    return enriched


@app.get("/api/listings/public")
async def get_public_listings(
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    community: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    now = time.time()
    results = [l for l in listings_db if now - l.get("postedAt", 0) < LISTING_EXPIRY_SECONDS and l.get("status") != "sold"]

    all_public_ids: set[int] = {
        c.id for c in db.query(Community).filter(Community.is_public == True).all()
    }

    def _ncid(cid):
        if isinstance(cid, int):
            return cid
        if isinstance(cid, str) and cid.isdigit():
            return int(cid)
        return cid

    def _is_public_listing(listing: dict) -> bool:
        vis = listing.get("visibility")
        if vis == "private":
            return False
        lc = listing.get("communities", [])
        if not lc:
            return True
        return any(
            isinstance(_ncid(c), int) and _ncid(c) in all_public_ids
            for c in lc
        ) or "neighborhood" in lc

    if community and community != "All":
        parts = [c.strip() for c in community.split(",") if c.strip()]
        filtered: list[dict] = []
        for listing in results:
            norm_cids = [_ncid(c) for c in listing.get("communities", [])]
            for part in parts:
                try:
                    cid = int(part)
                except ValueError:
                    continue
                if cid in norm_cids and cid in all_public_ids:
                    filtered.append(listing)
                    break
        results = filtered
    else:
        results = [l for l in results if _is_public_listing(l)]

    if search:
        q = search.lower()
        results = [
            l for l in results
            if q in l["title"].lower() or q in l["description"].lower()
            or any(q in t.lower() for t in l.get("tags", []))
        ]

    if tag and tag != "All":
        results = [l for l in results if tag.lower() in [t.lower() for t in l.get("tags", [])]]

    if sort == "price_low":
        results.sort(key=lambda l: float(l.get("price", 0)))
    elif sort == "price_high":
        results.sort(key=lambda l: float(l.get("price", 0)), reverse=True)
    else:
        results.sort(key=lambda l: l.get("postedAt", 0), reverse=True)

    # Enrich
    all_community_ids_set: set[int] = set()
    for l in results:
        for cid in l.get("communities", []):
            if isinstance(cid, int):
                all_community_ids_set.add(cid)
    pub_info: dict[int, dict] = {}
    if all_community_ids_set:
        for c in db.query(Community).filter(Community.id.in_(all_community_ids_set)).all():
            pub_info[c.id] = {"name": c.name, "is_public": c.is_public}

    # Poster map for neighborhood name lookup
    pub_poster_ids = {l.get("userId") for l in results if l.get("userId")}
    pub_poster_map: dict[int, User] = {}
    if pub_poster_ids:
        pub_poster_map = {u.id: u for u in db.query(User).filter(User.id.in_(pub_poster_ids)).all()}

    enriched_pub = []
    for l in results:
        listing_copy = dict(l)
        listing_copy["visibility"] = "public"
        poster = pub_poster_map.get(l.get("userId"))
        listing_copy["seller_name"] = poster.display_name if poster else None
        listing_copy["seller_picture"] = poster.profile_picture if poster else None
        if poster and poster.neighborhood:
            listing_copy["location"] = poster.neighborhood
            l["location"] = poster.neighborhood
        all_comms = []
        for cid in l.get("communities", []):
            if cid == "neighborhood":
                poster = pub_poster_map.get(l.get("userId"))
                hood_name = poster.neighborhood if poster and poster.neighborhood else l.get("location", "Neighborhood")
                all_comms.append({"name": hood_name, "is_public": True, "is_mutual": False, "is_neighborhood": True})
            elif isinstance(cid, int) and cid in pub_info:
                all_comms.append({**pub_info[cid], "is_mutual": False})
        all_comms.sort(key=lambda c: c["name"])
        listing_copy["allCommunities"] = all_comms
        enriched_pub.append(listing_copy)
    return enriched_pub


@app.get("/api/listings/mine")
async def get_my_listings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    my_listings = [l for l in listings_db if l.get("userId") == current_user.id]

    # Enrich with pending order count and latest order timestamp
    listing_ids = [l["id"] for l in my_listings]
    pending_orders = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.listing_id.in_(listing_ids),
            PurchaseOrder.seller_id == current_user.id,
            PurchaseOrder.status == "pending",
        )
        .all()
    )
    order_counts: dict[str, int] = {}
    latest_order_at: dict[str, str] = {}
    for o in pending_orders:
        order_counts[o.listing_id] = order_counts.get(o.listing_id, 0) + 1
        ts = o.created_at.isoformat() if o.created_at else ""
        if o.listing_id not in latest_order_at or ts > latest_order_at[o.listing_id]:
            latest_order_at[o.listing_id] = ts

    enriched = []
    for l in my_listings:
        listing_copy = dict(l)
        if current_user.neighborhood:
            listing_copy["location"] = current_user.neighborhood
            l["location"] = current_user.neighborhood
        listing_copy["pendingOrderCount"] = order_counts.get(l["id"], 0)
        listing_copy["latestOrderAt"] = latest_order_at.get(l["id"])
        enriched.append(listing_copy)
    return enriched


@app.post("/api/listings/{listing_id}/relist")
async def relist_listing(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for listing in listings_db:
        if listing["id"] == listing_id and listing.get("userId") == current_user.id:
            listing["postedAt"] = time.time()
            listing["status"] = "open"

            # Cancel pending orders and notify buyers
            pending_orders = db.query(PurchaseOrder).filter(
                PurchaseOrder.listing_id == listing_id,
                PurchaseOrder.status == "pending",
            ).all()
            for o in pending_orders:
                o.status = "withdrawn"
                db.add(Notification(
                    user_id=o.buyer_id,
                    type="order_cancelled",
                    title="Order Cancelled",
                    message=f'The listing "{listing["title"]}" was relisted. Your order has been cancelled.',
                    listing_id=listing_id,
                ))

            # Delete old declined/withdrawn orders to unlock previously declined buyers
            db.query(PurchaseOrder).filter(
                PurchaseOrder.listing_id == listing_id,
                PurchaseOrder.status.in_(["declined", "withdrawn"]),
            ).delete(synchronize_session=False)
            db.commit()

            return listing
    raise HTTPException(status_code=404, detail="Listing not found")


@app.put("/api/listings/{listing_id}")
async def update_listing(
    listing_id: str,
    data: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    try:
        details = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in data field")

    for listing in listings_db:
        if listing["id"] == listing_id and listing.get("userId") == current_user.id:
            if listing.get("status") == "sold":
                raise HTTPException(status_code=400, detail="Cannot edit a sold listing")
            for field in ("title", "description", "price", "condition", "location", "tags"):
                if field in details:
                    listing[field] = details[field]
            return listing
    raise HTTPException(status_code=404, detail="Listing not found")


@app.get("/api/wishlist")
async def get_wishlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(WishlistItem).filter(WishlistItem.user_id == current_user.id).all()
    return [item.listing_id for item in items]


@app.get("/api/wishlist/listings")
async def get_wishlist_listings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(WishlistItem)
        .filter(WishlistItem.user_id == current_user.id)
        .order_by(WishlistItem.created_at.desc())
        .all()
    )
    wishlisted_ids = {item.listing_id for item in items}
    now = time.time()
    return [l for l in listings_db if l["id"] in wishlisted_ids and now - l.get("postedAt", 0) < LISTING_EXPIRY_SECONDS]


@app.post("/api/wishlist/{listing_id}")
async def toggle_wishlist(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(WishlistItem).filter(
        WishlistItem.user_id == current_user.id,
        WishlistItem.listing_id == listing_id,
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"wishlisted": False}
    item = WishlistItem(user_id=current_user.id, listing_id=listing_id)
    db.add(item)
    db.commit()
    return {"wishlisted": True}
