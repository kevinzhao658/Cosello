import asyncio
import base64
import io
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env", override=True)

import anthropic
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User, Community, CommunityMember, WishlistItem, WishlistFolder, PurchaseOrder, Notification, Listing
from auth import get_current_user, get_optional_user
from routers.auth import router as auth_router
from routers.communities import router as communities_router
from routers.events import router as events_router
from routers.friends import router as friends_router
from routers.notifications import router as notifications_router
from routers.orders import router as orders_router
from routers.searches import router as searches_router
from category_schemas import CATEGORY_SCHEMAS
from services.google import vision
from services.google.vision import VisionResult
from services.evidence import build_evidence_block, _format_single_image_evidence
from services.ranking import score_listings, _apply_exclusions as _fyp_apply_exclusions
from services import storage
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
app.include_router(communities_router)
app.include_router(events_router)
app.include_router(friends_router)
app.include_router(notifications_router)
app.include_router(orders_router)
app.include_router(searches_router)

# Legacy local-disk uploads directory. Pre-Phase 3 listings stored images here;
# everything new goes to Supabase Storage. On Vercel the runtime filesystem is
# read-only, so we skip the mkdir + StaticFiles mount when running there —
# nothing writes to this path in production anyway.
UPLOADS_DIR = Path(__file__).parent / "uploads"
if not os.getenv("VERCEL"):
    UPLOADS_DIR.mkdir(exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.get("/api/categories")
def get_categories():
    return CATEGORY_SCHEMAS


client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

# ---------------------------------------------------------------------------
# Phase-2 Mapbox config — backend-proxied token, never sent to the browser.
# Gracefully absent until the user provides a key; all Mapbox features degrade
# to null/204 when MAPBOX_TOKEN is unset.
# ---------------------------------------------------------------------------
_MAPBOX_TOKEN: str | None = os.getenv("MAPBOX_TOKEN") or None

# In-process walk-time cache: { (buyer_zip, listing_id) -> int | None }.
# Prevents re-calling the Mapbox Directions API on every repeated modal open
# for the same buyer+listing pair. Resets on process restart (acceptable for MVP).
# Server-side cache of rendered buyer-map PNGs, keyed (listing_id, radius).
# ~150-250 KB each; 128 entries caps memory at ~30 MB. In-process (resets on
# restart) — same trade-off as _walk_cache, acceptable for MVP.
_MAP_PNG_CACHE_MAX = 128
_map_png_cache: dict[tuple[str, float], bytes] = {}

# Public-community id set, cached 60s: queried on EVERY feed request but the
# set changes ~never (community creation is rare). Saves one ~90ms DB round
# trip per feed load against the remote Supabase pooler.
_public_ids_cache: dict[str, object] = {"ids": None, "at": 0.0}
_PUBLIC_IDS_TTL_S = 60.0

_walk_cache: dict[tuple[str, str], int | None] = {}

import random

LISTING_EXPIRY_SECONDS = 7 * 24 * 60 * 60  # 7 days


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


def _run_vision_with_cache(resized_bytes_list: list[bytes]) -> tuple[list, bool]:
    """Run Google Vision on images. Returns (VisionResults, retrieval_fallback).

    The phash-based dedup cache was removed when imagehash+scipy were dropped to
    fit Vercel's 250 MB bundle cap. At MVP scale per-image cost (~$0.0015) is
    negligible; reintroduce a numpy-only inline pHash dedup if Vision spend
    becomes material. See docs/COMMERCIAL_PR_CHECKLIST.md.
    """
    try:
        vision_results = vision.analyze_images(resized_bytes_list)
        return vision_results, False
    except Exception as e:
        logger.warning("Google Vision call failed, falling back to visual-only: %s", e)
        return [], True


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
    # Bake EXIF orientation into pixels so portrait phone shots aren't saved sideways.
    # exif_transpose returns the image with orientation applied and the tag normalized;
    # guard against the (theoretical) None return just in case.
    transposed = ImageOps.exif_transpose(pil_img)
    if transposed is not None:
        pil_img = transposed
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
    """Read, preprocess, and push uploads to Supabase Storage.

    Used by `/api/segment-photos` — listing_id doesn't exist yet here
    (drafts), so files land under listings/drafts/. The actual listing-create
    path generates an id upfront and uses it for its uploads.

    Returns (bytes_list, image_urls) preserving original order.
    """
    bytes_list: list[bytes] = []
    image_urls: list[str] = []
    for img in images:
        raw = await img.read()
        processed = _preprocess_image_bytes(raw)
        url = storage.upload_image("listings", "drafts", processed, "jpg")
        bytes_list.append(processed)
        image_urls.append(url)
    return bytes_list, image_urls


def _resolve_image_url_to_bytes(url: str) -> bytes | None:
    """Download bytes for an image URL — used by the listing-generation pipeline.

    Production stores listing images exclusively as Supabase Storage public URLs.
    Returns None for any URL that doesn't point at the cosello-images bucket.
    """
    if not url or not storage.is_storage_url(url):
        return None
    return storage.download_image(url)


def _build_segmentation_prompt(n: int) -> str:
    return (
        f"You are a photo grouper for a marketplace listing tool. The seller has uploaded {n} photos. "
        "Some photos may show the same item from different angles; others may show distinct items.\n\n"
        "Group the images by which depict the same physical item. Return ONLY a JSON array. "
        f"Each element is an array of image indices that belong together. Every index 0..{n - 1} must appear in exactly one group.\n\n"
        "IMPORTANT: Err strongly on the side of SEPARATING items. Only group images together if you are highly confident "
        "they show the exact same physical object (e.g., multiple angles of the same chair). "
        "If two photos show different types of objects (e.g., a laptop and a coffee table), they MUST be in separate groups.\n\n"
        "Examples: 3 angles of one chair → [[0, 1, 2]]; chair + lamp → [[0], [1]]; laptop + table + treadmill → [[0], [1], [2]].\n\n"
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


SEGMENTATION_THUMBNAIL_DIM = 768


def _downscale_for_segmentation(raw: bytes) -> bytes:
    """Aggressive downscale for Claude segmentation calls — payload reduction.

    Segmentation only needs enough detail to tell items apart, not full
    resolution. Caps the longest side at SEGMENTATION_THUMBNAIL_DIM and
    drops JPEG quality to 75. Cuts payload ~10x vs the 2048px originals,
    which keeps Sonnet's multi-image latency in single-digit seconds.
    """
    pil_img = Image.open(io.BytesIO(raw))
    # Bake EXIF orientation so the AI sees the image the right way up (better grouping).
    transposed = ImageOps.exif_transpose(pil_img)
    if transposed is not None:
        pil_img = transposed
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    pil_img.thumbnail((SEGMENTATION_THUMBNAIL_DIM, SEGMENTATION_THUMBNAIL_DIM), Image.LANCZOS)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=75)
    return buf.getvalue()


def _segment_with_claude(image_bytes_list: list[bytes], vision_signals: list[VisionResult]) -> list[list[int]]:
    """Run a segmentation-only Claude call. Falls back to a single group on any failure."""
    n = len(image_bytes_list)
    if n <= 1:
        return [[i for i in range(n)]] if n == 1 else []

    thumbnails = [_downscale_for_segmentation(b) for b in image_bytes_list]

    content: list[dict] = []
    for idx, data in enumerate(thumbnails):
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
        # Haiku 4.5 is plenty for a "which photos belong together" classification
        # task. Typically 3-5x faster than Sonnet for vision payloads, with
        # accuracy that holds for this segmentation prompt (validated in
        # listing_eval canary). Tight 25s timeout to fail fast.
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": content}],
            timeout=25.0,
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


_SIGNED_UPLOAD_ALLOWED_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}


class SignedUploadUrlRequest(BaseModel):
    count: int = Field(1, ge=1, le=20)
    ext: str = Field("jpg")


@app.post("/api/storage/signed-upload-url")
def create_signed_upload_urls(
    req: SignedUploadUrlRequest,
    current_user: User = Depends(get_current_user),
):
    ext_normalized = req.ext.lower().lstrip(".")
    if ext_normalized not in _SIGNED_UPLOAD_ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"ext must be one of {sorted(_SIGNED_UPLOAD_ALLOWED_EXTS)}",
        )
    return [
        storage.mint_signed_upload_url("listings", f"drafts/{current_user.id}", ext_normalized)
        for _ in range(req.count)
    ]


@app.post("/api/segment-photos")
async def segment_photos(
    images: list[UploadFile] = File(default_factory=list),
    image_urls: str = Form(""),
    current_user: User | None = Depends(get_optional_user),
):
    parsed_image_urls: list[str] = []
    if image_urls:
        try:
            parsed_image_urls = json.loads(image_urls)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in image_urls field")
        if not isinstance(parsed_image_urls, list) or not all(isinstance(u, str) for u in parsed_image_urls):
            raise HTTPException(status_code=400, detail="image_urls must be a JSON array of strings")
        for u in parsed_image_urls:
            if not storage.is_storage_url(u):
                raise HTTPException(status_code=400, detail=f"image_urls contains non-Storage URL: {u}")

    if not images and not parsed_image_urls:
        raise HTTPException(status_code=400, detail="At least one image or image_url is required")

    total_count = len(images) + len(parsed_image_urls)
    if total_count > 20:
        raise HTTPException(status_code=400, detail="At most 20 images allowed per request")

    try:
        if parsed_image_urls:
            # Direct-uploaded objects in Storage are the user's raw originals
            # (Tier 3 swap removed the pre-upload Pillow pass). Preprocess on
            # the way in so Vision + Claude see resized bytes under their
            # respective per-image size limits (Claude rejects >5 MB).
            # Run the download + Pillow work in parallel — both are blocking
            # I/O + CPU work, and serial execution was the dominant pre-Claude
            # latency for bulk uploads (5-10 photos = 2-5s wasted).
            def _download_and_preprocess(u: str) -> bytes:
                return _preprocess_image_bytes(storage.download_image(u))
            bytes_list = list(await asyncio.gather(*(
                asyncio.to_thread(_download_and_preprocess, u) for u in parsed_image_urls
            )))
            out_image_urls = parsed_image_urls
        else:
            bytes_list, out_image_urls = await _save_uploaded_images(images)
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
        "image_urls": out_image_urls,
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
async def generate_listings(
    req: GenerateListingsRequest,
    current_user: User | None = Depends(get_optional_user),
):
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
    # Validate group indices and resolve image bytes (legacy disk OR Storage).
    # Always Pillow-preprocess so Claude per-image bytes stay under 5 MB; raw
    # phone uploads regularly exceed that since Tier 3 stopped pre-resizing.
    image_bytes_list: list[bytes] = []
    for url in req.image_urls:
        data = _resolve_image_url_to_bytes(url)
        if data is None:
            raise HTTPException(
                status_code=400,
                detail=f"Image URL does not resolve to readable bytes: {url}",
            )
        data = _preprocess_image_bytes(data)
        image_bytes_list.append(data)

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


@app.post("/api/listings", status_code=201)
async def create_listing(
    images: list[UploadFile] = File(default_factory=list),
    data: str = Form(...),
    communities: str = Form(""),
    visibility: str = Form("public"),
    pickup_location: str = Form(""),
    pickup_zip: str = Form(""),
    draft_urls: str = Form(""),
    image_order: str = Form(""),
    latitude: str = Form(""),
    longitude: str = Form(""),
    map_radius_mi: str = Form(""),
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

    # Parse draft_urls (relocated draft objects from /api/segment-photos).
    parsed_draft_urls: list[str] = []
    if draft_urls:
        try:
            parsed_draft_urls = json.loads(draft_urls)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in draft_urls field")
        if not isinstance(parsed_draft_urls, list) or not all(isinstance(u, str) for u in parsed_draft_urls):
            raise HTTPException(status_code=400, detail="draft_urls must be a JSON array of strings")
        for u in parsed_draft_urls:
            if not storage.is_storage_url(u):
                raise HTTPException(status_code=400, detail=f"draft_urls contains non-Storage URL: {u}")

    if not images and not parsed_draft_urls:
        raise HTTPException(status_code=400, detail="At least one image or draft_url is required")

    if len(parsed_draft_urls) + len(images) > 20:
        raise HTTPException(status_code=400, detail="At most 20 images allowed per listing")

    # Parse community IDs the listing is posted to.
    # Post-PR-3: only integer IDs are recognized. Legacy "neighborhood" strings
    # from older clients are silently dropped (they map to no community).
    community_ids: list[int] = []
    if communities:
        for part in communities.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                community_ids.append(int(part))
            except ValueError:
                pass  # silently drop non-int values (incl. legacy "neighborhood")

    # Hard cap of 3 — enforced for both public and private listings.
    if len(community_ids) > 3:
        raise HTTPException(
            status_code=400,
            detail="At most 3 communities per listing",
        )

    # Validate each id: exists + user is a member.
    for cid in community_ids:
        comm = db.query(Community).filter(Community.id == cid).first()
        if not comm:
            raise HTTPException(status_code=400, detail=f"Community {cid} not found")
        is_member = (
            db.query(CommunityMember)
            .filter(
                CommunityMember.community_id == cid,
                CommunityMember.user_id == current_user.id,
            )
            .first()
        )
        if not is_member:
            raise HTTPException(
                status_code=400,
                detail=f"You are not a member of community {cid}",
            )

    # Private-listing extra rules: must have ≥1 community and all must be private.
    if visibility != "public":
        if len(community_ids) == 0:
            raise HTTPException(
                status_code=400,
                detail="Private listing must have at least one community",
            )
        for cid in community_ids:
            comm = db.query(Community).filter(Community.id == cid).first()
            if comm.is_public:
                raise HTTPException(
                    status_code=400,
                    detail=f"Community {cid} is not private",
                )

    # Validate category slug
    category_slug = details.get("category", "other")
    if category_slug not in CATEGORY_SCHEMAS:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category_slug}")

    # Generate listing_id upfront so uploads land under listings/{listing_id}/
    listing_id = uuid.uuid4().hex[:12]

    # Push all images to Supabase Storage. Drafts move server-side (no bytes
    # transferred); freshly attached files upload as before.
    #
    # When image_order is provided it is a JSON array of tokens of the form
    # "draft:<i>" or "upload:<j>", defining the exact final order (first token
    # = cover photo). When absent the legacy behaviour is preserved: all drafts
    # first, then all uploaded files.
    image_urls: list[str] = []
    if image_order:
        # --- Manifest path ---
        try:
            order_tokens: list = json.loads(image_order)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="image_order must be valid JSON")
        if not isinstance(order_tokens, list) or not all(isinstance(t, str) for t in order_tokens):
            raise HTTPException(status_code=400, detail="image_order must be a JSON array of strings")

        _token_re = re.compile(r"^(draft|upload):(\d+)$")
        draft_indices_seen: list[int] = []
        upload_indices_seen: list[int] = []
        for token in order_tokens:
            m = _token_re.match(token)
            if not m:
                raise HTTPException(
                    status_code=400,
                    detail=f"image_order token '{token}' does not match 'draft:<i>' or 'upload:<j>'",
                )
            kind, idx_str = m.group(1), m.group(2)
            idx = int(idx_str)
            if kind == "draft":
                if idx < 0 or idx >= len(parsed_draft_urls):
                    raise HTTPException(
                        status_code=400,
                        detail=f"image_order draft index {idx} is out of range (0..{len(parsed_draft_urls) - 1})",
                    )
                draft_indices_seen.append(idx)
            else:
                if idx < 0 or idx >= len(images):
                    raise HTTPException(
                        status_code=400,
                        detail=f"image_order upload index {idx} is out of range (0..{len(images) - 1})",
                    )
                upload_indices_seen.append(idx)

        # Every draft and upload index must appear exactly once.
        expected_drafts = list(range(len(parsed_draft_urls)))
        expected_uploads = list(range(len(images)))
        if sorted(draft_indices_seen) != expected_drafts:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"image_order must reference every draft index exactly once; "
                    f"expected {expected_drafts}, got {sorted(draft_indices_seen)}"
                ),
            )
        if sorted(upload_indices_seen) != expected_uploads:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"image_order must reference every upload index exactly once; "
                    f"expected {expected_uploads}, got {sorted(upload_indices_seen)}"
                ),
            )

        # Pre-read all upload file bytes indexed by position so we can access
        # them in arbitrary order dictated by the manifest.
        upload_contents: dict[int, tuple[bytes, str]] = {}
        for j, img in enumerate(images):
            ext = img.filename.rsplit(".", 1)[-1] if img.filename and "." in img.filename else "jpg"
            contents = await img.read()
            upload_contents[j] = (contents, ext)

        # Walk the manifest in order to build image_urls.
        for token in order_tokens:
            m = _token_re.match(token)
            kind, idx = m.group(1), int(m.group(2))  # already validated above
            if kind == "draft":
                image_urls.append(storage.move_image(parsed_draft_urls[idx], "listings", listing_id))
            else:
                contents, ext = upload_contents[idx]
                image_urls.append(storage.upload_image("listings", listing_id, contents, ext))
    else:
        # --- Legacy path (backward-compatible) — drafts first, then uploads ---
        for url in parsed_draft_urls:
            image_urls.append(storage.move_image(url, "listings", listing_id))
        for img in images:
            ext = img.filename.rsplit(".", 1)[-1] if img.filename and "." in img.filename else "jpg"
            contents = await img.read()
            image_urls.append(storage.upload_image("listings", listing_id, contents, ext))

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

    # Validate priceCents — non-negative integer required.
    price_cents_in = details.get("priceCents")
    if not isinstance(price_cents_in, int) or isinstance(price_cents_in, bool) or price_cents_in < 0:
        raise HTTPException(
            status_code=400,
            detail="priceCents must be a non-negative integer (cents)",
        )

    condition_score_in = details.get("conditionScore")
    if condition_score_in is not None:
        if (
            not isinstance(condition_score_in, int)
            or isinstance(condition_score_in, bool)
            or not (0 <= condition_score_in <= 100)
        ):
            raise HTTPException(
                status_code=400,
                detail="conditionScore must be an integer between 0 and 100",
            )

    product_year_in = details.get("productYear")
    if product_year_in is not None and (
        not isinstance(product_year_in, int) or isinstance(product_year_in, bool)
    ):
        raise HTTPException(
            status_code=400,
            detail="productYear must be an integer or null",
        )

    identifier_confidence_in = details.get("identifierConfidence")
    if identifier_confidence_in is not None and identifier_confidence_in not in (
        "high",
        "medium",
        "low",
    ):
        raise HTTPException(
            status_code=400,
            detail='identifierConfidence must be "high", "medium", or "low"',
        )

    from services.geo import centroid_for_zip, round_coord as _round_coord
    import re as _re

    _radius: float | None = None
    if map_radius_mi.strip():
        from services.mapbox import MIN_MAP_RADIUS_MI, MAX_MAP_RADIUS_MI
        try:
            _radius = float(map_radius_mi)
        except ValueError:
            raise HTTPException(status_code=400, detail="map_radius_mi must be a number")
        if not (MIN_MAP_RADIUS_MI <= _radius <= MAX_MAP_RADIUS_MI):
            raise HTTPException(
                status_code=400,
                detail=f"map_radius_mi must be between {MIN_MAP_RADIUS_MI} and {MAX_MAP_RADIUS_MI}",
            )

    if latitude.strip() and longitude.strip():
        # Pin path (Phase 2b): coords from the seller's pin. Round server-side
        # (privacy floor — never trust client rounding), derive the ZIP via
        # reverse geocode, ignore any client-sent pickup_zip.
        try:
            _pin_lat, _pin_lng = float(latitude), float(longitude)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid pin coordinates")
        listing_lat = _round_coord(_pin_lat)
        listing_lng = _round_coord(_pin_lng)
        if not _MAPBOX_TOKEN:
            raise HTTPException(status_code=503, detail="Could not verify pickup location — try again")
        from services.mapbox import reverse_geocode_zip
        _rev = reverse_geocode_zip(listing_lat, listing_lng, _MAPBOX_TOKEN)
        if _rev is None:
            raise HTTPException(status_code=503, detail="Could not verify pickup location — try again")
        _zip, _place_label = _rev
        if centroid_for_zip(db, _zip) is None:
            raise HTTPException(status_code=400, detail="Pickup must be in Manhattan for now")
        if not pickup_location.strip():
            pickup_location = _place_label
    else:
        # Legacy / degraded path: ZIP dropdown drives coords (unchanged).
        _zip = pickup_zip.strip()
        if not _re.fullmatch(r"\d{5}", _zip):
            raise HTTPException(status_code=400, detail="Enter a valid NYC ZIP code")
        _centroid = centroid_for_zip(db, _zip)
        if _centroid is None:
            raise HTTPException(status_code=400, detail="Enter a valid NYC ZIP code")
        listing_lat = _round_coord(_centroid[0])
        listing_lng = _round_coord(_centroid[1])

    posted_at = time.time()
    listing = Listing(
        id=listing_id,
        user_id=current_user.id,
        brand=brand_str or None,
        name=name_str or None,
        description=details.get("description", ""),
        price_cents=price_cents_in,
        condition=details.get("condition", "Good"),
        condition_score=condition_score_in,
        product_year=product_year_in,
        identifier_confidence=identifier_confidence_in,
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
        posted_at=posted_at,
        original_posted_at=posted_at,
        relist_count=0,
        zip_code=_zip,
        latitude=listing_lat,
        longitude=listing_lng,
        map_radius_mi=_radius,
    )
    db.add(listing)
    db.commit()
    return listing.to_dict()


@app.get("/api/listings")
def get_listings(
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    community: Optional[str] = Query(None),
    neighborhood: Optional[str] = Query(None),
    max_distance: Optional[float] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = time.time()
    cutoff = now - LISTING_EXPIRY_SECONDS
    rows = db.query(Listing).filter(Listing.posted_at >= cutoff, Listing.status != "sold").all()
    rows_by_id: dict[str, Listing] = {r.id: r for r in rows}
    results = [r.to_dict() for r in rows]

    # --- Distance computation + max_distance filter ---
    from services.geo import centroid_for_zip, haversine_miles
    buyer = centroid_for_zip(db, (current_user.zip_code or "").strip() or None) if current_user else None
    for item in results:
        lat, lng = item.get("latitude"), item.get("longitude")
        if buyer is not None and lat is not None and lng is not None:
            item["distance_miles"] = round(haversine_miles(buyer[0], buyer[1], lat, lng), 1)
        else:
            item["distance_miles"] = None
    if max_distance is not None and buyer is not None:
        results = [it for it in results if it["distance_miles"] is not None and it["distance_miles"] <= max_distance]

    # FYP mode is the default feed: no search, no community filter (or "All").
    # Search relevance and explicit community browses retain their existing
    # tier/relevance ordering.
    fyp_mode = (not search) and (not community or community == "All")

    if _public_ids_cache["ids"] is not None and (now - float(_public_ids_cache["at"])) < _PUBLIC_IDS_TTL_S:
        all_public_ids: set[int] = _public_ids_cache["ids"]  # type: ignore[assignment]
    else:
        all_public_ids = {
            c.id for c in db.query(Community).filter(Community.is_public == True).all()
        }
        _public_ids_cache["ids"] = all_public_ids
        _public_ids_cache["at"] = now
    my_community_ids: set[int] = {
        m.community_id
        for m in db.query(CommunityMember).filter(CommunityMember.user_id == current_user.id).all()
    }
    my_neighborhood = current_user.neighborhood

    # Batch-fetch poster user records for neighborhood checks
    poster_ids = {l.get("userId") for l in results if l.get("userId")}
    poster_map: dict[str, User] = {}
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
            if isinstance(nc, int) and nc in all_public_ids:
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
            if isinstance(nc, int) and nc in my_community_ids:
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
        elif fyp_mode:
            # FYP path: drop excluded listings, score the rest, sort by
            # (-score, -postedAt). Score is internal and never serialized.
            candidate_rows = [
                rows_by_id[l["id"]] for l in results if l["id"] in rows_by_id
            ]
            kept_rows = _fyp_apply_exclusions(current_user, candidate_rows, db)
            kept_ids = {r.id for r in kept_rows}
            scored = score_listings(current_user, kept_rows, db, now)
            score_by_id: dict[str, float] = {r.id: s for r, s in scored}
            results = [l for l in results if l["id"] in kept_ids]
            results.sort(
                key=lambda l: (
                    -score_by_id.get(l["id"], 0.0),
                    -l.get("postedAt", 0),
                )
            )
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
            community_info_map[c.id] = {"name": c.name, "is_public": c.is_public, "image": c.image}

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
            if isinstance(cid, int) and cid in community_info_map:
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
def get_public_listings(
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
        )

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
            pub_info[c.id] = {"name": c.name, "is_public": c.is_public, "image": c.image}

    pub_poster_ids = {l.get("userId") for l in results if l.get("userId")}
    pub_poster_map: dict[str, User] = {}
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
            if isinstance(cid, int) and cid in pub_info:
                # Only show public communities on unauthenticated endpoint
                if pub_info[cid].get("is_public", True):
                    all_comms.append({**pub_info[cid], "is_mutual": False})
        all_comms.sort(key=lambda c: c["name"])
        listing_copy["allCommunities"] = all_comms
        enriched_pub.append(listing_copy)
    return enriched_pub


@app.get("/api/listings/mine")
def get_my_listings(
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

    # Enrich each listing with `allCommunities` so the trust band on the
    # MyAccount Listings cards can display the same community chip the
    # marketplace feed does. Mirrors the enrichment in /api/listings.
    all_community_ids_set: set[int] = set()
    for l in my_listings:
        for cid in l.get("communities", []):
            if isinstance(cid, int):
                all_community_ids_set.add(cid)
    community_info_map: dict[int, dict] = {}
    if all_community_ids_set:
        for c in db.query(Community).filter(Community.id.in_(all_community_ids_set)).all():
            community_info_map[c.id] = {"name": c.name, "is_public": c.is_public, "image": c.image}
    my_community_ids: set[int] = {
        m.community_id
        for m in db.query(CommunityMember).filter(CommunityMember.user_id == current_user.id).all()
    }

    enriched = []
    for l in my_listings:
        listing_copy = dict(l)
        if current_user.neighborhood:
            listing_copy["location"] = current_user.neighborhood
            l["location"] = current_user.neighborhood
        listing_copy["pendingOrderCount"] = order_counts.get(l["id"], 0)
        listing_copy["latestOrderAt"] = latest_order_at.get(l["id"])

        # Build allCommunities (same shape as /api/listings).
        all_comms = []
        for cid in l.get("communities", []):
            if isinstance(cid, int) and cid in community_info_map:
                info = community_info_map[cid]
                is_mutual = cid in my_community_ids
                if not info.get("is_public", True) and not is_mutual:
                    continue
                all_comms.append({**info, "is_mutual": is_mutual})
        all_comms.sort(key=lambda c: (not c["is_mutual"], c["name"]))
        listing_copy["allCommunities"] = all_comms

        enriched.append(listing_copy)
    return enriched


@app.get("/api/listings/{listing_id}")
def get_listing_detail(
    listing_id: str,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Single-listing detail endpoint.  Returns the listing dict enriched with:

    - All the standard fields from ``Listing.to_dict()``
    - ``walk_minutes: int | null`` — Mapbox Directions walking estimate between
      the buyer's ZIP centroid and the listing's coarse coordinates.  Null when
      ``MAPBOX_TOKEN`` is unset, buyer ZIP is unknown, listing coords are null,
      or the Directions call fails.  Result is cached per ``(buyer_zip,
      listing_id)`` in ``_walk_cache`` to avoid redundant API calls.

    **Cost guard:** ``walk_minutes`` is computed ONLY here (single-listing
    detail).  It is NOT computed in the list/feed endpoint where calling
    Directions for every item would be slow and expensive.
    """
    listing = db.query(Listing).filter(Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    result = listing.to_dict()

    # --- walk_minutes ---
    walk: int | None = None
    if (
        _MAPBOX_TOKEN
        and listing.latitude is not None
        and listing.longitude is not None
        and current_user is not None
    ):
        buyer_zip = (current_user.zip_code or "").strip() or None
        if buyer_zip:
            cache_key = (buyer_zip, listing_id)
            if cache_key in _walk_cache:
                walk = _walk_cache[cache_key]
            else:
                from services.geo import centroid_for_zip
                from services.mapbox import (
                    MAP_CIRCLE_RADIUS_MI,
                    offset_circle_center,
                    walking_minutes as _walking_minutes,
                )
                buyer_coords = centroid_for_zip(db, buyer_zip)
                if buyer_coords is not None:
                    # Estimate to the MIDPOINT of the circle the buyer sees,
                    # not the listing's true coords: keeps the number
                    # consistent with the rendered map and leaks nothing.
                    radius = (
                        listing.map_radius_mi
                        if listing.map_radius_mi is not None
                        else MAP_CIRCLE_RADIUS_MI
                    )
                    dest_lat, dest_lng = offset_circle_center(
                        listing_id, listing.latitude, listing.longitude, radius
                    )
                    walk = _walking_minutes(
                        buyer_coords[0], buyer_coords[1],
                        dest_lat, dest_lng,
                        _MAPBOX_TOKEN,
                    )
                _walk_cache[cache_key] = walk

    result["walk_minutes"] = walk
    return result


@app.get("/api/listings/{listing_id}/map.png")
def get_listing_map(
    listing_id: str,
    db: Session = Depends(get_db),
):
    """Stream a Mapbox static map PNG for the listing's approximate pickup area.

    The map shows a translucent circle centred on the listing's coarsened
    coordinates (already rounded to ~110 m at creation time) with a radius of
    ``MAP_CIRCLE_RADIUS_MI`` miles — communicating the approximate area without
    revealing an exact address.  No marker/pin is drawn.

    Response codes:
    - ``200 image/png``  — success; PNG bytes from Mapbox, cached 24 h.
    - ``204 No Content`` — ``MAPBOX_TOKEN`` unset OR listing has null lat/lng.
                           Frontend renders its existing placeholder.
    - ``404``            — listing not found.
    - ``503``            — Mapbox call returned an error/timeout.

    The Mapbox token is NEVER included in the response body or headers.
    The exact lat/lng coordinates are NEVER included in the response.
    No authentication required — buyers browsing must see the map.
    """
    listing = db.query(Listing).filter(Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    if not _MAPBOX_TOKEN or listing.latitude is None or listing.longitude is None:
        return Response(status_code=204)

    from services.mapbox import MAP_CIRCLE_RADIUS_MI, fetch_static_map_png, offset_circle_center
    radius = listing.map_radius_mi if listing.map_radius_mi is not None else MAP_CIRCLE_RADIUS_MI
    # Server-side cache: the rendered PNG is stable for a listing+radius, so
    # only the FIRST viewer pays Mapbox's render latency (~0.5-1s). FIFO cap.
    cache_key = (listing_id, radius)
    png_bytes = _map_png_cache.get(cache_key)
    if png_bytes is None:
        # Render the image + circle centered on a deterministic per-listing
        # OFFSET point, never the stored coords — the circle's center must not
        # reveal the listing's location (and the offset must be stable across
        # renders so it can't be averaged away).
        c_lat, c_lng = offset_circle_center(listing.id, listing.latitude, listing.longitude, radius)
        png_bytes = fetch_static_map_png(c_lat, c_lng, radius, _MAPBOX_TOKEN)
        if png_bytes is None:
            raise HTTPException(status_code=503, detail="Map image unavailable")
        if len(_map_png_cache) >= _MAP_PNG_CACHE_MAX:
            _map_png_cache.pop(next(iter(_map_png_cache)))  # FIFO eviction
        _map_png_cache[cache_key] = png_bytes

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.post("/api/listings/{listing_id}/relist")
def relist_listing(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = db.query(Listing).filter(Listing.id == listing_id, Listing.user_id == current_user.id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    # Bump cycle counter BEFORE timestamps so any concurrent reads see the new
    # cycle number paired with the new posted_at. original_posted_at is left
    # untouched — it captures the listing's first appearance.
    listing.relist_count = (listing.relist_count or 0) + 1
    listing.posted_at = time.time()
    listing.status = "open"

    # Cancel pending orders and notify buyers. Declined/withdrawn orders from
    # prior cycles stay in place as historical records — new orders post-relist
    # land at the new list_cycle so previously-declined buyers can re-engage.
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

    db.commit()

    return listing.to_dict()


@app.put("/api/listings/{listing_id}")
def update_listing(
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

    field_map = {"description": "description",
                 "condition": "condition", "location": "location", "category": "category",
                 "brand": "brand", "name": "name"}
    for field, attr in field_map.items():
        if field in details:
            setattr(listing, attr, details[field])

    # Price edits accept priceCents (int, cents, source of truth).
    # Legacy clients sending `price` as a whole-dollar string are converted.
    if "priceCents" in details:
        pc = details["priceCents"]
        if not isinstance(pc, int) or isinstance(pc, bool) or pc < 0:
            raise HTTPException(
                status_code=400,
                detail="priceCents must be a non-negative integer (cents)",
            )
        listing.price_cents = pc
    elif "price" in details:
        raw = details["price"]
        try:
            cleaned = str(raw).strip().lstrip("$").strip()
            listing.price_cents = int(round(float(cleaned) * 100))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid price value")

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


# Statuses that mean an order is already terminal — cascade-cancel must skip
# these so we don't overwrite completed sales, prior buyer/seller cancellations,
# or expired pickup windows. Active statuses (pending, confirmed) get flipped.
# `cancelled_by_seller` is a new status introduced by this endpoint.
_TERMINAL_ORDER_STATUSES = (
    "completed",
    "declined",
    "withdrawn",
    "expired",
    "cancelled_by_seller",
)


@app.delete("/api/listings/{listing_id}", status_code=204)
def delete_listing(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = db.query(Listing).filter(Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your listing")
    if listing.status == "sold":
        raise HTTPException(status_code=400, detail="Sold listings cannot be removed")

    listing_title = listing.title_str

    active_orders = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.listing_id == listing_id,
            PurchaseOrder.status.notin_(_TERMINAL_ORDER_STATUSES),
        )
        .all()
    )
    for order in active_orders:
        order.status = "cancelled_by_seller"
        db.add(Notification(
            user_id=order.buyer_id,
            type="order_cancelled",
            title="Order Cancelled",
            message=f'Seller removed the listing "{listing_title}" — your order has been cancelled.',
            related_user_id=current_user.id,
            listing_id=listing_id,
        ))

    db.delete(listing)
    db.commit()
    return Response(status_code=204)


@app.get("/api/wishlist")
def get_wishlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(WishlistItem).filter(WishlistItem.user_id == current_user.id).all()
    return [item.listing_id for item in items]


@app.get("/api/wishlist/listings")
def get_wishlist_listings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(WishlistItem)
        .filter(WishlistItem.user_id == current_user.id)
        .order_by(WishlistItem.created_at.desc())
        .all()
    )
    if not items:
        return []
    folder_by_listing = {item.listing_id: item.folder_id for item in items}
    wishlisted_ids = set(folder_by_listing.keys())
    now = time.time()
    cutoff = now - LISTING_EXPIRY_SECONDS
    rows = db.query(Listing).filter(Listing.id.in_(wishlisted_ids), Listing.posted_at >= cutoff).all()
    results = []
    for r in rows:
        d = r.to_dict()
        d["folder_id"] = folder_by_listing.get(r.id)
        results.append(d)
    return results


# ---------- wishlist folders ----------
#
# These routes are declared BEFORE `POST /api/wishlist/{listing_id}` so the
# literal `/folders` and `/{listing_id}/folder` paths don't get shadowed by
# the catch-all `{listing_id}` segment (FastAPI matches routes in
# registration order).

class WishlistFolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class WishlistFolderUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class WishlistItemFolderUpdate(BaseModel):
    folder_id: Optional[int] = None


def _validate_folder_name(name: str) -> str:
    trimmed = (name or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty")
    if len(trimmed) > 80:
        raise HTTPException(status_code=400, detail="Folder name too long (max 80)")
    return trimmed


@app.get("/api/wishlist/folders")
def list_wishlist_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folders = (
        db.query(WishlistFolder)
        .filter(WishlistFolder.user_id == current_user.id)
        .order_by(WishlistFolder.created_at.asc())
        .all()
    )
    if not folders:
        return []
    folder_ids = [f.id for f in folders]
    counts: dict[int, int] = {fid: 0 for fid in folder_ids}
    rows = (
        db.query(WishlistItem.folder_id)
        .filter(
            WishlistItem.user_id == current_user.id,
            WishlistItem.folder_id.in_(folder_ids),
        )
        .all()
    )
    for (fid,) in rows:
        counts[fid] = counts.get(fid, 0) + 1
    return [
        {"id": f.id, "name": f.name, "item_count": counts.get(f.id, 0)}
        for f in folders
    ]


@app.post("/api/wishlist/folders", status_code=201)
def create_wishlist_folder(
    body: WishlistFolderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = _validate_folder_name(body.name)
    folder = WishlistFolder(user_id=current_user.id, name=name)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder.to_dict()


@app.patch("/api/wishlist/folders/{folder_id}")
def update_wishlist_folder(
    folder_id: int,
    body: WishlistFolderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = (
        db.query(WishlistFolder)
        .filter(
            WishlistFolder.id == folder_id,
            WishlistFolder.user_id == current_user.id,
        )
        .first()
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder.name = _validate_folder_name(body.name)
    db.commit()
    db.refresh(folder)
    return folder.to_dict()


@app.delete("/api/wishlist/folders/{folder_id}", status_code=204)
def delete_wishlist_folder(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = (
        db.query(WishlistFolder)
        .filter(
            WishlistFolder.id == folder_id,
            WishlistFolder.user_id == current_user.id,
        )
        .first()
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    # FK uses ON DELETE SET NULL — items remain wishlisted, just unfiled.
    db.delete(folder)
    db.commit()
    return


@app.patch("/api/wishlist/{listing_id}/folder", status_code=204)
def set_wishlist_item_folder(
    listing_id: str,
    body: WishlistItemFolderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(WishlistItem)
        .filter(
            WishlistItem.user_id == current_user.id,
            WishlistItem.listing_id == listing_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Listing not in wishlist")
    if body.folder_id is not None:
        folder = (
            db.query(WishlistFolder)
            .filter(
                WishlistFolder.id == body.folder_id,
                WishlistFolder.user_id == current_user.id,
            )
            .first()
        )
        if not folder:
            raise HTTPException(status_code=400, detail="Folder not owned by user")
    item.folder_id = body.folder_id
    db.commit()
    return


@app.post("/api/wishlist/{listing_id}")
def toggle_wishlist(
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
