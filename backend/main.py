import asyncio
import base64
import io
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env", override=True)

import anthropic
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import User, Community, CommunityMember, WishlistItem, PurchaseOrder, Notification, Listing
from auth import get_current_user
from routers.auth import router as auth_router
from routers.communities import router as communities_router
from routers.friends import router as friends_router
from routers.notifications import router as notifications_router
from routers.orders import router as orders_router
from category_schemas import CATEGORY_SCHEMAS
from services.google import vision
from services.google.vision import VisionResult
from services.evidence import build_evidence_block, _format_single_image_evidence
from services.cache import PHashCache

logger = logging.getLogger(__name__)

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

    # Add category, category_attributes to listings if missing
    if "listings" in inspector.get_table_names():
        cols = [c["name"] for c in inspector.get_columns("listings")]
        if "category" not in cols:
            conn.execute(text("ALTER TABLE listings ADD COLUMN category VARCHAR(30) DEFAULT 'other'"))
            conn.commit()
        if "category_attributes" not in cols:
            conn.execute(text("ALTER TABLE listings ADD COLUMN category_attributes VARCHAR(2000)"))
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


@app.get("/api/categories")
async def get_categories():
    return CATEGORY_SCHEMAS


client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
_phash_cache = PHashCache()

import random

LISTING_EXPIRY_SECONDS = 7 * 24 * 60 * 60  # 7 days


@app.post("/api/dev/seed-listings")
async def seed_listings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dev-only: seed the database with sample listings using existing uploaded images."""
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

        listing = Listing(
            id=uuid.uuid4().hex[:12],
            user_id=current_user.id,
            brand=item.get("brand", ""),
            name=item.get("name", ""),
            description=item["description"],
            price=item["price"],
            condition=item["condition"],
            location=current_user.neighborhood or random.choice(neighborhoods),
            tags=json.dumps(item["tags"]),
            communities=json.dumps(["neighborhood"]),
            visibility="public",
            image_url=image_urls[0],
            image_urls=json.dumps(image_urls),
            pickup_location=current_user.pickup_address or "",
            category=item.get("category", "other"),
            category_attributes=json.dumps(item.get("category_attributes", {})),
            status="open",
            posted_at=time.time() - random.randint(0, 86400 * 3),
        )
        db.add(listing)
        created.append({"id": listing.id, "title": listing.title_str})

    db.commit()
    return {"seeded": len(created), "listings": created}


def _run_vision_with_cache(resized_bytes_list: list[bytes]) -> tuple[list, bool]:
    """Run Google Vision on images, using phash cache for dedup. Returns (VisionResults, retrieval_fallback)."""
    retrieval_fallback = False
    vision_results = []
    try:
        uncached_indices = []
        uncached_bytes = []
        for i, img_bytes in enumerate(resized_bytes_list):
            cached = _phash_cache.get(img_bytes)
            if cached is not None:
                vision_results.append((i, cached))
            else:
                uncached_indices.append(i)
                uncached_bytes.append(img_bytes)

        if uncached_bytes:
            fresh = vision.analyze_images(uncached_bytes)
            for idx, result in zip(uncached_indices, fresh):
                _phash_cache.set(resized_bytes_list[idx], result)
                vision_results.append((idx, result))

        vision_results.sort(key=lambda x: x[0])
        vision_results = [r for _, r in vision_results]
    except Exception as e:
        logger.warning("Google Vision call failed, falling back to visual-only: %s", e)
        retrieval_fallback = True
        vision_results = []

    return vision_results, retrieval_fallback


# --- Two-pass listing generation: segment-photos -> generate-listings ---
# (The legacy single-pass `_build_prompt_text` was removed alongside the
# brand/name unification — listing-gen is now exclusively two-pass via
# `_build_listing_prompt_for_group` per group.)

MAX_IMAGE_BYTES = 3_500_000
MAX_IMAGE_DIMENSION = 2048


def _vision_result_to_dict(r: VisionResult) -> dict:
    """Serialize a VisionResult dataclass to a JSON-safe dict for client roundtrip."""
    return {
        "best_guess_labels": list(r.best_guess_labels),
        "web_entities": [[name, float(score)] for name, score in r.web_entities],
        "matching_page_titles": list(r.matching_page_titles),
        "labels": [[name, float(score)] for name, score in r.labels],
        "ocr_text": r.ocr_text,
    }


def _vision_dict_to_result(d: dict) -> VisionResult:
    """Reverse of _vision_result_to_dict — used when client passes signals back."""
    return VisionResult(
        best_guess_labels=list(d.get("best_guess_labels") or []),
        web_entities=[(e[0], float(e[1])) for e in (d.get("web_entities") or []) if isinstance(e, (list, tuple)) and len(e) >= 2],
        matching_page_titles=list(d.get("matching_page_titles") or []),
        labels=[(l[0], float(l[1])) for l in (d.get("labels") or []) if isinstance(l, (list, tuple)) and len(l) >= 2],
        ocr_text=d.get("ocr_text") or "",
    )


def _preprocess_image_bytes(raw: bytes) -> bytes:
    """Apply existing PIL resize/JPEG normalization. Returns processed bytes."""
    pil_img = Image.open(io.BytesIO(raw))
    if pil_img.mode == "RGBA":
        pil_img = pil_img.convert("RGB")
    if len(raw) > MAX_IMAGE_BYTES or pil_img.width > MAX_IMAGE_DIMENSION or pil_img.height > MAX_IMAGE_DIMENSION:
        pil_img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.LANCZOS)
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


async def _save_uploaded_images(images: list[UploadFile]) -> tuple[list[bytes], list[str]]:
    """Read, preprocess, and persist uploads under backend/uploads/.

    Returns (bytes_list, image_urls) preserving original order.
    """
    bytes_list: list[bytes] = []
    image_urls: list[str] = []
    for img in images:
        raw = await img.read()
        processed = _preprocess_image_bytes(raw)
        filename = f"{uuid.uuid4().hex}.jpg"
        (UPLOADS_DIR / filename).write_bytes(processed)
        bytes_list.append(processed)
        image_urls.append(f"/uploads/{filename}")
    return bytes_list, image_urls


def _resolve_image_url_to_path(url: str) -> Path | None:
    """Map a /uploads/<name> URL to a Path on disk. Reject path traversal."""
    if not url or not url.startswith("/uploads/"):
        return None
    name = url[len("/uploads/"):]
    if "/" in name or "\\" in name or name in ("", ".", ".."):
        return None
    candidate = (UPLOADS_DIR / name).resolve()
    try:
        candidate.relative_to(UPLOADS_DIR.resolve())
    except ValueError:
        return None
    if not candidate.is_file():
        return None
    return candidate


def _build_segmentation_prompt(n: int) -> str:
    return (
        f"You are a photo grouper for a marketplace listing tool. The seller has uploaded {n} photos. "
        "Some photos may show the same item from different angles; others may show distinct items.\n\n"
        "Group the images by which depict the same physical item. Return ONLY a JSON array. "
        f"Each element is an array of image indices that belong together. Every index 0..{n - 1} must appear in exactly one group.\n\n"
        "Examples: 3 angles of one chair → [[0, 1, 2]]; chair + lamp → [[0], [1]].\n\n"
        "Return ONLY the JSON array. No commentary, no fences."
    )


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        # split off first line ("```json" or "```")
        parts = raw.split("\n", 1)
        if len(parts) == 2:
            raw = parts[1]
        raw = raw.rsplit("```", 1)[0].strip()
    return raw


def _validate_groupings(parsed: object, n: int) -> list[list[int]] | None:
    """Validate that parsed is a list-of-lists of int covering 0..N-1 exactly once."""
    if not isinstance(parsed, list) or not parsed:
        return None
    seen: set[int] = set()
    out: list[list[int]] = []
    for group in parsed:
        if not isinstance(group, list) or not group:
            return None
        normalized: list[int] = []
        for idx in group:
            if not isinstance(idx, int) or isinstance(idx, bool):
                return None
            if idx < 0 or idx >= n:
                return None
            if idx in seen:
                return None
            seen.add(idx)
            normalized.append(idx)
        out.append(normalized)
    if seen != set(range(n)):
        return None
    return out


def _segment_with_claude(image_bytes_list: list[bytes], vision_signals: list[VisionResult]) -> list[list[int]]:
    """Run a segmentation-only Claude call. Falls back to a single group on any failure."""
    n = len(image_bytes_list)
    if n <= 1:
        return [[i for i in range(n)]] if n == 1 else []

    content: list[dict] = []
    for idx, data in enumerate(image_bytes_list):
        content.append({"type": "text", "text": f"[Image {idx}]"})
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64.b64encode(data).decode("utf-8"),
            },
        })

    evidence_block = build_evidence_block(vision_signals) if vision_signals else ""
    if evidence_block:
        content.append({"type": "text", "text": evidence_block})

    content.append({"type": "text", "text": _build_segmentation_prompt(n)})

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": content}],
        )
        raw = _strip_fences(response.content[0].text)
        parsed = json.loads(raw)
    except (json.JSONDecodeError, anthropic.APIError, IndexError, AttributeError) as e:
        logger.warning("Segmentation Claude call failed (%s); falling back to single group", e)
        return [list(range(n))]

    validated = _validate_groupings(parsed, n)
    if validated is None:
        logger.warning("Segmentation returned invalid groupings %r; falling back to single group", parsed)
        return [list(range(n))]
    return validated


def format_title(brand: str | None, name: str | None) -> str:
    """Render a display title from a (brand, name) pair.

    Both arguments are coerced to "" if None or whitespace-only. The literal
    string "Unknown" (case-insensitive) on `brand` is also coerced to "" —
    the listing-gen pipeline historically wrote "Unknown" for unbranded
    items, which would otherwise produce ugly `"Unknown Foo"` titles.

    Returns `(brand + " " + name).strip()`.
    """
    b = brand.strip() if isinstance(brand, str) else ""
    n = name.strip() if isinstance(name, str) else ""
    if b.lower() == "unknown":
        b = ""
    return f"{b} {n}".strip()


# Allowed values for the per-batch rationale field on /api/generate-listings.
RATIONALE_OPTIONS: tuple[str, ...] = (
    "",
    "Moving",
    "Upgrading",
    "No longer fits",
    "Gift never used",
    "Decluttering",
    "Other",
)


def _normalize_brand_hint(s: str) -> str:
    """Normalize a seller-confirmed brand hint before it lands in a Claude prompt.

    Rules:
    - Non-string -> ""
    - Whitespace-only / empty -> ""
    - 80+ chars -> "" (real brand names are short; long inputs are almost certainly noise or injection)
    - Contains an HTML tag (`<` or `>`) -> "" (real brand names never contain these)
    - Otherwise: trim outer whitespace and return.
    """
    if not isinstance(s, str):
        return ""
    cleaned = s.strip()
    if not cleaned:
        return ""
    if len(cleaned) >= 80:
        return ""
    if "<" in cleaned or ">" in cleaned:
        return ""
    return cleaned


DESCRIPTION_VOICE_INSTRUCTIONS = """
DESCRIPTION VOICE & STRUCTURE

Write the description in FIRST PERSON, as if you (the seller) are personally
describing the item to a buyer. Sound like a real person, not marketing copy.

Structure: 2-4 sentences total.
- Sentence 1: brief rationale for selling (see RATIONALE OPENERS below)
- Sentences 2-3: describe the item — what it is, key details, model when relevant
- Sentence 4 (optional): honest condition note (e.g., "worn maybe twice",
  "had this for about 2 years", "small scuff on the back")

REQUIRED CHARACTERISTICS:
- First-person voice ("I'm selling", "I bought this", "It doesn't fit me anymore")
- Specific details over abstract claims ("worn maybe twice" not "lightly used")
- Conversational rhythm — mix shorter and longer sentences
- Honest about flaws when they exist

WORDS / PHRASES TO AVOID (these scream marketing or AI):
- premium, exclusive, seamless, must-have, unlock, elevate, vibrant, elegant,
  stunning, breathtaking, renowned, iconic, luxurious
- stands as, testament to, pivotal, underscores, reflects broader
- "perfect for [demographic]" framing
- "experts agree" or "widely considered" filler
- Rule-of-three marketing padding ("durable, stylish, and versatile")
- Negative parallelism ("not just X but also Y")
- Sycophancy ("a true gem", "a real find")

PUNCTUATION / FORMATTING:
- NO em dashes — use commas or periods
- NO emojis
- NO bold, italic, or markdown — plain text only
- Straight quotes only (no curly quotes)
- No headings or bullet points within the description

RATIONALE OPENERS — use as sentence stem, NOT verbatim. Adapt naturally.

- "Moving" -> Lead with relocation context.
  Examples: "Moving across town next month and need to clear out my closet."
            "Relocating soon and this is too bulky to take with me."

- "Upgrading" -> Lead with the upgrade.
  Examples: "Upgraded my couch recently so this one needs a new home."
            "Got a newer version, so this is up for grabs."

- "No longer fits" -> Lead with sizing honesty (clothing/shoes mainly).
  Examples: "It doesn't fit me anymore. Bought in size M but I've slimmed down."
            "Wrong size for me, time for someone else to enjoy it."

- "Gift never used" -> Lead with the gift context.
  Examples: "Got this as a gift but never had a chance to use it."
            "Was a gift, sat in my closet. Hoping it goes to someone who'll use it."

- "Decluttering" -> Lead with the decluttering reason.
  Examples: "Decluttering my place and this needs a new home."
            "Cleaning out my closet, too many of these, time to part with one."

- "Other" with custom text -> Use the seller's free-text rationale naturally as the opening.
  Example (rationale_other = "Kid grew out of it"):
    "My kid grew out of these. They were great while they lasted."

- "" (no rationale provided) -> Skip the rationale opener entirely. Lead with item
  details in first person.
  Examples: "Selling my [item]. [Details]. [Condition note]."
            "Putting up my [item] for sale. [Details]."

EXAMPLES OF GOOD DESCRIPTIONS:

[Hermes scarf, rationale=Decluttering]
"Decluttering my closet and this Hermes scarf needs a new home. Carre 90
in blue and gold, silk, no tears. I've worn it maybe twice."

[IKEA Linanas couch, rationale=Moving]
"Moving to a smaller place at the end of the month and the couch won't fit.
It's the Linanas in dark grey, used for about a year and a half. Pickup
only, it's heavy."

[Nike Air Force 1, rationale=No longer fits]
"Bought these in size 10 but my feet have grown a half size. Air Force 1
Low in white, worn maybe three times. Still pretty pristine."

EXAMPLES OF BAD DESCRIPTIONS (do NOT write like these):

[Marketing voice]
"Premium Hermes silk scarf featuring vibrant blue and gold tones. Iconic
Carre 90 design, perfect for any wardrobe."

[Inflated importance + rule of three]
"This stunning IKEA couch stands as a testament to Scandinavian design.
Durable, stylish, and versatile."

[Third person + filler]
"Genuine Nike Air Force 1 sneakers. Excellent condition - barely worn -
features clean white leather upper."
"""


def _rationale_value_line(rationale: str, rationale_other: str) -> str:
    """Render the per-listing rationale value line that pairs with DESCRIPTION_VOICE_INSTRUCTIONS.

    Tells Claude which RATIONALE OPENERS bullet applies to this listing.
    Returns the trailing newline-terminated line, suffixed with a blank line.
    """
    if rationale == "Other":
        custom = (rationale_other or "").strip()
        if not custom:
            return (
                "No rationale provided — skip the rationale opener and lead with "
                "item details.\n\n"
            )
        return f"Custom rationale: '{custom}'\n\n"
    if not rationale:
        return (
            "No rationale provided — skip the rationale opener and lead with "
            "item details.\n\n"
        )
    return f"The seller's rationale is: '{rationale}'.\n\n"


def _build_listing_prompt_for_group(
    group_indices: list[int],
    evidence_block: str,
    brand_hint: str,
    name: str,
    rationale: str,
    rationale_other: str,
) -> str:
    """Build the per-group LISTING-GEN prompt. Single-listing schema (one item per call).

    Args:
        group_indices: original image indices that belong to this listing.
        evidence_block: pre-rendered retrieval-evidence text (may be empty).
        brand_hint: seller-confirmed brand string (may be empty).
        name: seller-provided product name (may be empty).
        rationale: one of RATIONALE_OPTIONS.
        rationale_other: free-text reason; only used when rationale == "Other".
    """
    preamble = (
        "You are a product identification assistant for a secondhand marketplace. "
        "The seller has uploaded photos of a single item (possibly from multiple angles). "
        f"The photos for this item are at indices {group_indices}.\n\n"
    )

    brand_block = ""
    if brand_hint:
        brand_block = (
            f"SELLER-CONFIRMED BRAND\n"
            f"The seller has confirmed the brand for this item is '{brand_hint}' — "
            "treat as ground truth unless the photo clearly contradicts. "
            "Emit it in the `brand` field of the JSON. Do NOT include the brand inside `name`.\n\n"
        )

    name_block = ""
    clean_name = (name or "").strip()
    if clean_name:
        name_block = (
            "SELLER-CONFIRMED NAME\n"
            f"The seller has named this item '{clean_name}' — use this exactly as the "
            "`name` field. Do NOT include brand in the name.\n\n"
        )
    else:
        name_block = (
            "NAME GUIDANCE\n"
            "The seller did not provide a name. Generate a marketable product name "
            "(3-7 words) that excludes the brand — brand is a separate field.\n\n"
        )

    # Per-listing rationale value (pairs with the global DESCRIPTION_VOICE_INSTRUCTIONS
    # block, which contains the RATIONALE OPENERS catalog).
    rationale_value_block = (
        "SELLER RATIONALE\n"
        + _rationale_value_line(rationale, rationale_other)
    )
    description_voice_block = DESCRIPTION_VOICE_INSTRUCTIONS + "\n"

    if evidence_block:
        step1 = (
            f"{evidence_block}\n\n"
            "STEP 1 — READ THE RETRIEVAL EVIDENCE\n"
            "The evidence above was retrieved from a reverse image search and is keyed by image index. "
            f"Use ONLY the evidence from the images that belong to this listing ({group_indices}); "
            "ignore evidence keyed to other indices. "
            "Treat each per-image block as ground truth for that image unless the photo clearly contradicts it.\n"
        )
        step3_heading = "STEP 3 — WRITE THE LISTING AROUND THIS EVIDENCE\n"
    else:
        step1 = (
            "STEP 1 — METHODICAL IMAGE INSPECTION\n"
            "Examine the image(s) carefully for visible identifiers in this priority order:\n"
        )
        step3_heading = "STEP 3 — REVERSE-TRACE THE EXACT PRODUCT\n"

    step1 += (
        "1. Printed brand logos or wordmarks\n"
        "2. Model names or numbers printed on the product\n"
        "3. For clothing: interior care labels, hang tags, or visible style codes / barcodes — "
        "if you can see ANY of these, treat them as the PRIMARY identifier. Read them precisely.\n"
        "4. Distinctive silhouettes, colorways, materials, or construction details that match known products\n\n"
    )

    step2 = (
        "STEP 2 — CATEGORIZE\n"
        "Assign one of: clothing, furniture, electronics, sports, collectibles, other\n\n"
    )

    if evidence_block:
        step3 = (
            step3_heading
            + "Using the retrieval evidence and visible identifiers, write the listing. "
            "Use the identified product's known profile to inform:\n"
        )
    else:
        step3 = (
            step3_heading
            + "Using the identifiers you extracted, reason as if performing a reverse image search: "
            "what specific product from which brand does this most closely match? "
            "Use that product's known profile to inform:\n"
        )
    step3 += (
        "- Accurate current secondhand market price (NOT retail)\n"
        "- Description (key features + visible condition)\n"
        "- Category-specific fields (dimensions for furniture, specs for electronics, size/gender for clothing, etc.)\n\n"
    )

    step4 = (
        "STEP 4 — RETURN JSON ONLY\n"
        "{\n"
        '  "name": "product name only — DO NOT include the brand here",\n'
        '  "brand": "brand string only (e.g. \'Nike\', \'IKEA\'), or \"\" if no brand or seller did not provide one",\n'
        '  "description": "2-3 sentences, key features plus condition observations",\n'
        '  "price": "fair secondhand market price as string",\n'
        '  "condition": "New | Like New | Good | Fair | Poor",\n'
        '  "location": "Manhattan neighborhood",\n'
        '  "tags": ["3-5 tags"],\n'
        '  "category": "<category_slug>",\n'
        '  "categoryAttributes": { ...fields per category below... },\n'
        '  "identifierConfidence": "high | medium | low"\n'
        "}\n\n"
        "FIELD RULES:\n"
        "- `name` is the product name only — DO NOT include the brand in `name`. "
        "Brand is a separate field. (e.g. for a Nike Air Force 1, name = 'Air Force 1', brand = 'Nike'.)\n"
        "- `brand` is just the brand string ('Nike', 'IKEA', etc.). Empty string if no brand or "
        "if the seller did not provide one. Do NOT write 'Unknown'.\n"
        "- `categoryAttributes` MUST NOT contain `brand` or `model` keys. Brand is top-level; "
        "any model designation belongs inside `name`.\n\n"
    )

    category_attrs = (
        "Category-specific attributes (these go inside `categoryAttributes`):\n"
        "- clothing: size, gender (Men's/Women's/Unisex/Kids), style_code (ONLY if visible on tag/label in image)\n"
        "- furniture: carry_difficulty (One person | Two people | Requires truck or movers), "
        "dimensions (format: L x W x H if identifiable)\n"
        "- electronics: {} (empty object — brand is top-level, model goes in `name`)\n"
        "- sports: size (if determinable)\n"
        "- collectibles: year\n"
        "- other: {} (empty object)\n\n"
        "For furniture carry_difficulty, assess from visual cues: a small side table is \"One person\", "
        "a sofa or large bookshelf is \"Two people\", a sectional or armoire is \"Requires truck or movers\".\n\n"
    )

    confidence = (
        "CONFIDENCE RULES:\n"
        "- \"high\": brand AND specific product (or equivalent) are clearly visible or unambiguously identified from the image\n"
        "- \"medium\": brand is identified but the specific product is uncertain, OR identification relies on inference\n"
        "- \"low\": brand cannot be confidently determined from the image alone\n\n"
    )

    footer = "Return ONLY the JSON object. No markdown, no code fences, no commentary."
    return (
        preamble
        + brand_block
        + name_block
        + step1
        + step2
        + step3
        + rationale_value_block
        + description_voice_block
        + step4
        + category_attrs
        + confidence
        + footer
    )


def _call_claude_listing_sync(
    group_indices: list[int],
    group_bytes: list[bytes],
    evidence_block: str,
    brand_hint: str,
    name: str,
    rationale: str,
    rationale_other: str,
) -> dict:
    """Sync Claude call for a single listing. Raises on API/parse error."""
    content: list[dict] = []
    for original_idx, data in zip(group_indices, group_bytes):
        content.append({"type": "text", "text": f"[Image {original_idx}]"})
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64.b64encode(data).decode("utf-8"),
            },
        })

    prompt_text = _build_listing_prompt_for_group(
        group_indices, evidence_block, brand_hint, name, rationale, rationale_other
    )
    content.append({"type": "text", "text": prompt_text})

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        messages=[{"role": "user", "content": content}],
    )
    raw = _strip_fences(response.content[0].text)
    parsed = json.loads(raw)
    if isinstance(parsed, list):
        if not parsed:
            raise ValueError("Claude returned empty list")
        parsed = parsed[0]
    if not isinstance(parsed, dict):
        raise ValueError("Claude did not return a JSON object")
    return parsed


async def _generate_one_listing_async(
    group_indices: list[int],
    image_bytes_list: list[bytes],
    vision_signals: list[VisionResult],
    brand_hint: str,
    name: str,
    rationale: str,
    rationale_other: str,
    retrieval_fallback: bool,
    semaphore: asyncio.Semaphore,
) -> dict:
    """Async per-group listing-gen. Wraps errors as a placeholder dict; never raises.

    Args:
        brand_hint: seller-confirmed brand for this group (already normalized).
        name: seller-provided product name for this group (may be empty).
        rationale: per-batch rationale string (validated by the endpoint).
        rationale_other: free-text reason; only used when rationale == "Other".
    """
    group_bytes = [image_bytes_list[i] for i in group_indices]
    group_signals = [vision_signals[i] for i in group_indices] if vision_signals else []
    # Re-build evidence block ONLY for the indices in this group, preserving original indices in [Image N]
    if group_signals and not retrieval_fallback:
        # Use the same global vision_signals so [Image N] tags match the group_indices the prompt references.
        # build_evidence_block emits one [Image idx] block per result in order. We need the labels to match
        # the original indices, so use a small inline formatter.
        sections: list[str] = []
        for orig_idx, r in zip(group_indices, group_signals):
            section = _format_single_image_evidence(orig_idx, r)
            if section is not None:
                sections.append(section)
        if sections:
            header = (
                "RETRIEVAL EVIDENCE PER IMAGE "
                "(each block is ground truth ONLY for the image with the matching index — "
                "do NOT mix brands, models, OCR, or entities across images):"
            )
            evidence_block = header + "\n\n" + "\n\n".join(sections)
            if len(evidence_block) > 4000:
                evidence_block = evidence_block[:4000] + "\n..."
        else:
            evidence_block = ""
    else:
        evidence_block = ""

    async with semaphore:
        try:
            parsed = await asyncio.to_thread(
                _call_claude_listing_sync,
                group_indices,
                group_bytes,
                evidence_block,
                brand_hint,
                name,
                rationale,
                rationale_other,
            )
        except Exception as e:
            logger.warning("Per-group listing generation failed for indices %s: %s", group_indices, e)
            return {
                "name": "Listing generation failed",
                "brand": "",
                "description": "Please try regenerating this item.",
                "price": "0",
                "condition": "Good",
                "location": "",
                "tags": [],
                "category": "other",
                "categoryAttributes": {},
                "identifierConfidence": "low",
                "imageIndices": list(group_indices),
                "retrieval_fallback": retrieval_fallback,
                "_error": str(e),
            }

    # --- Normalize fields ---
    if "price" in parsed and isinstance(parsed["price"], str):
        parsed["price"] = parsed["price"].lstrip("$").strip()
    if "productYear" in parsed and isinstance(parsed["productYear"], str):
        try:
            parsed["productYear"] = int(parsed["productYear"])
        except ValueError:
            pass

    # --- Brand / name post-processing ---
    # 1. Resolve brand: prefer Claude's emitted `brand`, fall back to brand_hint.
    #    Strip common "Unknown" sentinel values.
    raw_brand = parsed.get("brand")
    if not isinstance(raw_brand, str):
        raw_brand = ""
    raw_brand = raw_brand.strip()
    if raw_brand.lower() == "unknown":
        raw_brand = ""
    if not raw_brand and brand_hint:
        raw_brand = brand_hint.strip()
    parsed["brand"] = raw_brand

    # 2. Strip legacy keys from categoryAttributes so we never leak `brand`/`model` there.
    cat_attrs = parsed.get("categoryAttributes")
    if isinstance(cat_attrs, dict):
        cat_attrs.pop("brand", None)
        cat_attrs.pop("model", None)
        parsed["categoryAttributes"] = cat_attrs
    else:
        parsed["categoryAttributes"] = {}

    # 3. Defensive name normalization. If Claude prefixed the brand into `name`,
    #    strip it. The seller-provided `name` is already authoritative when present,
    #    but Claude can still echo "Nike Air Force 1" — clean that up.
    raw_name = parsed.get("name")
    # Drop legacy `title` field if it slipped through.
    parsed.pop("title", None)
    parsed.pop("model", None)
    if not isinstance(raw_name, str):
        raw_name = ""
    raw_name = raw_name.strip()
    if raw_brand and raw_name.lower().startswith(raw_brand.lower() + " "):
        stripped = raw_name[len(raw_brand) + 1 :].strip()
        if stripped:
            logger.debug(
                "Stripped brand prefix %r from generated name %r -> %r",
                raw_brand, raw_name, stripped,
            )
            raw_name = stripped
    parsed["name"] = raw_name

    parsed["imageIndices"] = list(group_indices)
    parsed["retrieval_fallback"] = retrieval_fallback
    return parsed


@app.post("/api/segment-photos")
async def segment_photos(images: list[UploadFile] = File(...)):
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    try:
        bytes_list, image_urls = await _save_uploaded_images(images)
    except Exception as e:
        logger.exception("Failed to preprocess uploaded images")
        raise HTTPException(status_code=502, detail=f"Image preprocessing failed: {e}")

    vision_results, retrieval_fallback = _run_vision_with_cache(bytes_list)
    if retrieval_fallback or not vision_results:
        # Provide empty VisionResults per image so downstream length checks pass.
        vision_results = [VisionResult() for _ in bytes_list]

    try:
        groupings = _segment_with_claude(bytes_list, vision_results)
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e.message}")

    return {
        "groupings": groupings,
        "image_urls": image_urls,
        "vision_signals": [_vision_result_to_dict(r) for r in vision_results],
    }


class GenerateListingsRequest(BaseModel):
    groupings: list[list[int]]
    image_urls: list[str]
    vision_signals: list[dict]
    brand_hints: list[str]
    names: list[str] = []
    rationale: str = ""
    rationale_other: str = ""


@app.post("/api/generate-listings")
async def generate_listings(req: GenerateListingsRequest):
    if len(req.image_urls) != len(req.vision_signals):
        raise HTTPException(
            status_code=400,
            detail="image_urls and vision_signals must have the same length",
        )
    if len(req.brand_hints) != len(req.groupings):
        raise HTTPException(
            status_code=400,
            detail="brand_hints length must equal groupings length",
        )
    if len(req.names) != len(req.groupings):
        raise HTTPException(
            status_code=400,
            detail="names length must equal groupings length",
        )
    if req.rationale not in RATIONALE_OPTIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "rationale must be one of: "
                + ", ".join(repr(o) for o in RATIONALE_OPTIONS)
            ),
        )
    if req.rationale == "Other" and not req.rationale_other.strip():
        raise HTTPException(
            status_code=400,
            detail="rationale_other is required when rationale is 'Other'",
        )

    n = len(req.image_urls)
    # Validate group indices and resolve image bytes from disk
    image_bytes_list: list[bytes] = []
    for url in req.image_urls:
        path = _resolve_image_url_to_path(url)
        if path is None:
            raise HTTPException(
                status_code=400,
                detail=f"Image URL does not resolve to a file on disk: {url}",
            )
        image_bytes_list.append(path.read_bytes())

    seen: set[int] = set()
    for group in req.groupings:
        for idx in group:
            if not isinstance(idx, int) or idx < 0 or idx >= n:
                raise HTTPException(status_code=400, detail=f"Invalid image index in groupings: {idx}")
            seen.add(idx)

    vision_results = [_vision_dict_to_result(d) for d in req.vision_signals]
    retrieval_fallback = not any(
        r.best_guess_labels or r.web_entities or r.matching_page_titles or r.labels or r.ocr_text
        for r in vision_results
    )

    normalized_hints = [_normalize_brand_hint(h) for h in req.brand_hints]
    # Names: trim only; trust the client beyond that. The prompt itself instructs
    # Claude to use the seller-provided name verbatim when non-empty.
    normalized_names = [(s.strip() if isinstance(s, str) else "") for s in req.names]

    semaphore = asyncio.Semaphore(5)
    tasks = [
        _generate_one_listing_async(
            group_indices=group,
            image_bytes_list=image_bytes_list,
            vision_signals=vision_results,
            brand_hint=hint,
            name=name,
            rationale=req.rationale,
            rationale_other=req.rationale_other,
            retrieval_fallback=retrieval_fallback,
            semaphore=semaphore,
        )
        for group, hint, name in zip(req.groupings, normalized_hints, normalized_names)
    ]
    results = await asyncio.gather(*tasks)
    return results


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
        # Auto-attach user's public community memberships + neighborhood + private communities
        community_ids = []
        if current_user.neighborhood:
            community_ids.append("neighborhood")
        memberships = db.query(CommunityMember).filter(
            CommunityMember.user_id == current_user.id
        ).all()
        for m in memberships:
            comm = db.query(Community).filter(Community.id == m.community_id).first()
            if comm:
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

    # Validate category slug
    category_slug = details.get("category", "other")
    if category_slug not in CATEGORY_SCHEMAS:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category_slug}")

    # Save all uploaded images to disk
    image_urls: list[str] = []
    for img in images:
        ext = img.filename.rsplit(".", 1)[-1] if img.filename and "." in img.filename else "jpg"
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = UPLOADS_DIR / filename
        contents = await img.read()
        filepath.write_bytes(contents)
        image_urls.append(f"/uploads/{filename}")

    # Resolve brand + name. Prefer the new top-level fields. If a transitional
    # client still sends only `title`, derive (brand, name) by stripping a
    # leading brand prefix from the title — matches the migration's split rule.
    brand_in = details.get("brand")
    name_in = details.get("name")
    title_in = details.get("title")
    brand_str = brand_in.strip() if isinstance(brand_in, str) else ""
    name_str = name_in.strip() if isinstance(name_in, str) else ""
    if not name_str and isinstance(title_in, str) and title_in.strip():
        # Transitional bridge: split title on brand prefix.
        t = title_in.strip()
        if brand_str and t.lower().startswith(brand_str.lower() + " "):
            name_str = t[len(brand_str) + 1 :].strip()
        else:
            name_str = t
    # Strip stray legacy keys from categoryAttributes (defense in depth).
    raw_attrs = details.get("categoryAttributes") or {}
    if isinstance(raw_attrs, dict):
        raw_attrs.pop("brand", None)
        raw_attrs.pop("model", None)
    else:
        raw_attrs = {}

    listing = Listing(
        id=uuid.uuid4().hex[:12],
        user_id=current_user.id,
        brand=brand_str or None,
        name=name_str or None,
        description=details.get("description", ""),
        price=details.get("price", "0"),
        condition=details.get("condition", "Good"),
        location=current_user.neighborhood or details.get("location", ""),
        tags=json.dumps(details.get("tags", [])),
        communities=json.dumps(community_ids),
        visibility=visibility,
        image_url=image_urls[0],
        image_urls=json.dumps(image_urls),
        pickup_location=pickup_location or current_user.pickup_address or "",
        category=category_slug,
        category_attributes=json.dumps(raw_attrs) if raw_attrs else None,
        status="open",
        posted_at=time.time(),
    )
    db.add(listing)
    db.commit()
    return listing.to_dict()


@app.get("/api/listings")
async def get_listings(
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    community: Optional[str] = Query(None),
    neighborhood: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = time.time()
    cutoff = now - LISTING_EXPIRY_SECONDS
    rows = db.query(Listing).filter(Listing.posted_at >= cutoff, Listing.status != "sold").all()
    results = [r.to_dict() for r in rows]

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
            return True
        else:
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

    # Filter by category
    if category:
        cat_list = [c.strip().lower() for c in category.split(",") if c.strip()]
        if cat_list:
            results = [
                l for l in results
                if l.get("category", "other").lower() in cat_list
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
                # Private communities only visible to members — skip for non-members
                if not info.get("is_public", True) and not is_mutual:
                    continue
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
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    community: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    now = time.time()
    cutoff = now - LISTING_EXPIRY_SECONDS
    rows = db.query(Listing).filter(Listing.posted_at >= cutoff, Listing.status != "sold").all()
    results = [r.to_dict() for r in rows]

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

    # Filter by category
    if category:
        cat_list = [c.strip().lower() for c in category.split(",") if c.strip()]
        if cat_list:
            results = [
                l for l in results
                if l.get("category", "other").lower() in cat_list
            ]

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
        all_comms = []
        for cid in l.get("communities", []):
            if cid == "neighborhood":
                poster = pub_poster_map.get(l.get("userId"))
                hood_name = poster.neighborhood if poster and poster.neighborhood else l.get("location", "Neighborhood")
                all_comms.append({"name": hood_name, "is_public": True, "is_mutual": False, "is_neighborhood": True})
            elif isinstance(cid, int) and cid in pub_info:
                # Only show public communities on unauthenticated endpoint
                if pub_info[cid].get("is_public", True):
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
    rows = db.query(Listing).filter(Listing.user_id == current_user.id).order_by(Listing.posted_at.desc()).all()
    my_listings = [r.to_dict() for r in rows]

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
    listing = db.query(Listing).filter(Listing.id == listing_id, Listing.user_id == current_user.id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    listing.posted_at = time.time()
    listing.status = "open"

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
            message=f'The listing "{listing.title_str}" was relisted. Your order has been cancelled.',
            listing_id=listing_id,
        ))

    # Delete old declined/withdrawn orders to unlock previously declined buyers
    db.query(PurchaseOrder).filter(
        PurchaseOrder.listing_id == listing_id,
        PurchaseOrder.status.in_(["declined", "withdrawn"]),
    ).delete(synchronize_session=False)
    db.commit()

    return listing.to_dict()


@app.put("/api/listings/{listing_id}")
async def update_listing(
    listing_id: str,
    data: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        details = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in data field")

    listing = db.query(Listing).filter(Listing.id == listing_id, Listing.user_id == current_user.id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status == "sold":
        raise HTTPException(status_code=400, detail="Cannot edit a sold listing")

    field_map = {"description": "description", "price": "price",
                 "condition": "condition", "location": "location", "category": "category",
                 "brand": "brand", "name": "name"}
    for field, attr in field_map.items():
        if field in details:
            setattr(listing, attr, details[field])

    # Transitional bridge: if a client still sends `title` (no brand/name), split it.
    if "title" in details and "name" not in details and "brand" not in details:
        t = (details.get("title") or "").strip()
        b = (listing.brand or "").strip()
        if b and t.lower().startswith(b.lower() + " "):
            listing.name = t[len(b) + 1 :].strip()
        else:
            listing.name = t

    if "tags" in details:
        listing.tags = json.dumps(details["tags"])
    if "categoryAttributes" in details:
        attrs = details["categoryAttributes"] or {}
        if isinstance(attrs, dict):
            attrs.pop("brand", None)
            attrs.pop("model", None)
        else:
            attrs = {}
        listing.category_attributes = json.dumps(attrs)
    db.commit()
    return listing.to_dict()


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
    if not wishlisted_ids:
        return []
    now = time.time()
    cutoff = now - LISTING_EXPIRY_SECONDS
    rows = db.query(Listing).filter(Listing.id.in_(wishlisted_ids), Listing.posted_at >= cutoff).all()
    return [r.to_dict() for r in rows]


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
