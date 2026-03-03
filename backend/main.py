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
from models import User, Community, CommunityMember
from auth import get_current_user
from routers.auth import router as auth_router
from routers.communities import router as communities_router
from routers.friends import router as friends_router

# Create tables
Base.metadata.create_all(bind=engine)

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

# Create uploads directory
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

from listings_store import listings_db


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


@app.post("/api/listings")
async def create_listing(
    images: list[UploadFile] = File(...),
    data: str = Form(...),
    communities: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Parse the JSON product details
    try:
        details = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in data field")

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
        "location": details.get("location", ""),
        "tags": details.get("tags", []),
        "communities": community_ids,
        "imageUrl": image_urls[0],
        "imageUrls": image_urls,
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
    results = list(listings_db)

    # Build sets of public and user-accessible private community IDs
    all_public_ids: set[int] = {
        c.id for c in db.query(Community).filter(Community.is_public == True).all()
    }
    my_community_ids: set[int] = {
        m.community_id
        for m in db.query(CommunityMember).filter(CommunityMember.user_id == current_user.id).all()
    }
    my_neighborhood = current_user.neighborhood

    if community and community != "All":
        # Filtering by specific community/communities
        parts = [c.strip() for c in community.split(",") if c.strip()]
        filtered: list[dict] = []
        for listing in results:
            listing_communities = listing.get("communities", [])
            for part in parts:
                if part == "neighborhood":
                    # Neighborhood filter: listing must be posted to "neighborhood"
                    # and the poster must share the viewer's neighborhood
                    if "neighborhood" in listing_communities and neighborhood:
                        poster = db.query(User).filter(User.id == listing.get("userId")).first()
                        if poster and poster.neighborhood == neighborhood:
                            filtered.append(listing)
                            break
                else:
                    try:
                        cid = int(part)
                    except ValueError:
                        continue
                    # Listing must be posted to this community
                    if cid not in listing_communities:
                        continue
                    # If private, user must be a member
                    if cid in all_public_ids or cid in my_community_ids:
                        filtered.append(listing)
                        break
        results = filtered
    else:
        # "All" filter: show listings the user is allowed to see
        filtered = []
        for listing in results:
            listing_communities = listing.get("communities", [])
            if not listing_communities:
                # Legacy listings with no community — show to everyone
                filtered.append(listing)
                continue
            # Check if at least one of the listing's communities is visible to the user
            visible = False
            for cid in listing_communities:
                if cid == "neighborhood":
                    # Visible if poster shares the user's neighborhood
                    if my_neighborhood:
                        poster = db.query(User).filter(User.id == listing.get("userId")).first()
                        if poster and poster.neighborhood == my_neighborhood:
                            visible = True
                            break
                elif isinstance(cid, int):
                    if cid in all_public_ids or cid in my_community_ids:
                        visible = True
                        break
            if visible:
                filtered.append(listing)
        results = filtered

    # Filter by search query (matches title or description)
    if search:
        q = search.lower()
        results = [
            l for l in results
            if q in l["title"].lower() or q in l["description"].lower()
        ]

    # Filter by tag
    if tag and tag != "All":
        results = [
            l for l in results
            if tag.lower() in [t.lower() for t in l.get("tags", [])]
        ]

    # Sort
    if sort == "price_low":
        results.sort(key=lambda l: float(l.get("price", 0)))
    elif sort == "price_high":
        results.sort(key=lambda l: float(l.get("price", 0)), reverse=True)
    elif sort == "newest":
        results.sort(key=lambda l: l.get("postedAt", 0), reverse=True)

    return results


@app.get("/api/listings/mine")
async def get_my_listings(
    current_user: User = Depends(get_current_user),
):
    return [l for l in listings_db if l.get("userId") == current_user.id]
