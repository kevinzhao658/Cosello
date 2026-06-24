"""Listings router — CRUD, AI pipeline, map, categories.

Caches live here (single instance per process):
- _map_png_cache: rendered Mapbox PNG bytes, keyed (listing_id, radius).
- _public_ids_cache: set of public community IDs, TTL 60 s.
- _walk_cache: walk-time results from Mapbox Directions, keyed (buyer_zip, listing_id).

Tests that need to reset these caches do so via `main._walk_cache` etc.,
which are re-exported aliases pointing at these same dict objects (same identity).
"""

import asyncio
import base64
import json
import logging
import math
import os
import re
import time
import uuid
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from auth import get_current_user, get_optional_user
from category_schemas import CATEGORY_SCHEMAS
from database import get_db
from models import (
    Community,
    CommunityMember,
    Listing,
    Notification,
    PurchaseOrder,
    User,
)
from queries import assert_listing_owner, get_listing_or_404
from services import storage
from services.circles import (
    EMPTY_CIRCLES,
    public_seller_circles_batch,
    seller_circles_for_viewer,
    seller_circles_for_viewer_batch,
)
from services.google.vision import VisionResult
from services.listing_generation import (
    DESCRIPTION_VOICE_INSTRUCTIONS,
    RATIONALE_OPTIONS,
    _generate_one_listing_async,
    _normalize_brand_hint,
    _preprocess_image_bytes,
    _resolve_image_url_to_bytes,
    _run_vision_with_cache,
    _save_uploaded_images,
    _segment_with_claude,
    _vision_dict_to_result,
    _vision_result_to_dict,
    format_title,
)
from services.ranking import _apply_exclusions as _fyp_apply_exclusions
from services.ranking import score_listings

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Mapbox token — backend-proxied, never sent to the browser.
#
# Stored in main.py (the historical home) so tests can monkeypatch it via
# `monkeypatch.setattr(main, "_MAPBOX_TOKEN", ...)`. At request time the
# router reads the live value via a lazy import — no circular import risk
# because main is already fully initialised by the time any endpoint fires.
# ---------------------------------------------------------------------------
_MAPBOX_TOKEN: str | None = os.getenv("MAPBOX_TOKEN") or None


def _get_mapbox_token() -> str | None:
    """Return the live _MAPBOX_TOKEN value.

    Reads from the `main` module at call-time so that
    `monkeypatch.setattr(main, "_MAPBOX_TOKEN", ...)` in tests takes effect
    without needing to patch the router module separately.
    """
    try:
        import main as _main
        return _main._MAPBOX_TOKEN
    except (ImportError, AttributeError):
        return _MAPBOX_TOKEN

# ---------------------------------------------------------------------------
# In-process caches (single instance per process)
# ---------------------------------------------------------------------------

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

# In-process walk-time cache: { (buyer_zip, listing_id) -> int | None }.
# Prevents re-calling the Mapbox Directions API on every repeated modal open
# for the same buyer+listing pair. Resets on process restart (acceptable for MVP).
_walk_cache: dict[tuple[str, str], int | None] = {}

# ---------------------------------------------------------------------------
# Misc constants
# ---------------------------------------------------------------------------
LISTING_EXPIRY_SECONDS = 7 * 24 * 60 * 60  # 7 days

_SIGNED_UPLOAD_ALLOWED_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}

_TERMINAL_ORDER_STATUSES = (
    "completed",
    "declined",
    "withdrawn",
    "expired",
    "cancelled_by_seller",
)

# ---------------------------------------------------------------------------
# Pagination + radius constants
# ---------------------------------------------------------------------------

# Hard radius cap for the marketplace feed (miles). Listings beyond this
# distance from the buyer's ZIP centroid are excluded from all feed pages.
# Manhattan end-to-end is ~13 mi; 10 mi covers the island plus adjacent areas
# (Hoboken, Astoria) — a sensible hyperlocal bound.
FEED_MAX_RADIUS_MI = 10.0

# FYP candidate window: score up to this many of the most-recent-within-radius
# listings, then paginate the ranked result. Capped to bound scoring work.
_FYP_CANDIDATE_WINDOW = 300

# Default page size if caller doesn't specify.
_DEFAULT_PAGE_LIMIT = 24


# ---------------------------------------------------------------------------
# Cursor helpers
# ---------------------------------------------------------------------------

def _encode_cursor(payload: dict) -> str:
    """Encode a cursor payload dict as a URL-safe base64 string."""
    return base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode()


def _decode_cursor(cursor: str) -> dict | None:
    """Decode a cursor string back to its payload dict. Returns None on any error."""
    try:
        return json.loads(base64.urlsafe_b64decode(cursor.encode()))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Bounding-box prefilter helpers
# ---------------------------------------------------------------------------

# Approximate degrees-per-mile constants (mid-Manhattan latitude).
_DEG_PER_MILE_LAT = 1.0 / 69.0
_DEG_PER_MILE_LNG = 1.0 / 52.6


def _bbox_filter(query, lat: float, lng: float, radius_mi: float):
    """Add a bounding-box WHERE clause to a SQLAlchemy query.

    Filters ``Listing.latitude`` / ``Listing.longitude`` to a rectangular
    box that fully contains the circle of ``radius_mi`` miles around
    ``(lat, lng)``.  This is a cheap prefilter — the precise haversine check
    is applied in Python after fetching the candidate rows.

    Listings with null lat/lng are excluded (no coord = can't measure distance).
    """
    dlat = radius_mi * _DEG_PER_MILE_LAT
    dlng = radius_mi * _DEG_PER_MILE_LNG
    return query.filter(
        Listing.latitude.isnot(None),
        Listing.longitude.isnot(None),
        Listing.latitude.between(lat - dlat, lat + dlat),
        Listing.longitude.between(lng - dlng, lng + dlng),
    )


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class SignedUploadUrlRequest(BaseModel):
    count: int = Field(1, ge=1, le=20)
    ext: str = Field("jpg")


class GenerateListingsRequest(BaseModel):
    groupings: list[list[int]]
    image_urls: list[str]
    vision_signals: list[dict]
    brand_hints: list[str]
    names: list[str] = []
    rationale: str = ""
    rationale_other: str = ""


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

@router.get("/api/categories")
def get_categories():
    return CATEGORY_SCHEMAS


# ---------------------------------------------------------------------------
# AI pipeline
# ---------------------------------------------------------------------------

@router.post("/api/storage/signed-upload-url")
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


@router.post("/api/segment-photos")
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


@router.post("/api/generate-listings")
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


# ---------------------------------------------------------------------------
# Listing CRUD
# ---------------------------------------------------------------------------

@router.post("/api/listings", status_code=201)
async def create_listing(
    images: list[UploadFile] = File(default_factory=list),
    data: str = Form(...),
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
        _tok = _get_mapbox_token()
        if not _tok:
            raise HTTPException(status_code=503, detail="Could not verify pickup location — try again")
        from services.mapbox import reverse_geocode_zip
        _rev = reverse_geocode_zip(listing_lat, listing_lng, _tok)
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
        communities=None,  # communities retired (Phase 2): circles derive from the seller, not the listing
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


@router.get("/api/listings")
def get_listings(
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    community: Optional[str] = Query(None),
    neighborhood: Optional[str] = Query(None),
    max_distance: Optional[float] = Query(None),
    limit: int = Query(_DEFAULT_PAGE_LIMIT),
    cursor: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paginated, SQL-filtered marketplace feed for authenticated users.

    Returns ``{"items": [...], "nextCursor": <str|null>}``.  Each item dict is
    byte-identical to what ``Listing.to_dict()`` returned before this change,
    plus ``distance_miles``.

    Cursor encoding (opaque to callers): base64({"offset": <int>}).
    Offset is into the Python-sorted result window for the current filter
    combination, enabling stable pagination even when Python sort order
    differs from SQL order (tier, relevance, price).
    """
    from services.geo import centroid_for_zip, haversine_miles

    now = time.time()
    cutoff = now - LISTING_EXPIRY_SECONDS

    # Clamp limit to a reasonable range.
    limit = max(1, min(limit, 100))

    # Resolve buyer location for distance computation and radius cap.
    buyer = centroid_for_zip(db, (current_user.zip_code or "").strip() or None) if current_user else None

    # FYP mode: no search, no community filter (or "All").
    fyp_mode = (not search) and (not community or community == "All")

    # --- Resolve community visibility sets ---
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

    # --- Shared helper: per-dict visibility/tier (operates on to_dict() dicts) ---
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
        for c in lc:
            nc = _ncid(c)
            if isinstance(nc, int) and nc in my_community_ids:
                return True
        return False

    def _tier(listing: dict) -> int:
        """Tier 1: user's private communities. Tier 2: public/neighborhood. Tier 3: other public."""
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

    # ---------------------------------------------------------------------------
    # Build base SQL query with pushed-down filters
    # ---------------------------------------------------------------------------

    base_q = db.query(Listing).filter(
        Listing.posted_at >= cutoff,
        Listing.status != "sold",
    )

    # --- SQL: category filter ---
    if category:
        cat_list = [c.strip().lower() for c in category.split(",") if c.strip()]
        if cat_list:
            base_q = base_q.filter(func.lower(Listing.category).in_(cat_list))

    # --- SQL: search filter (ILIKE across title components + description + tags) ---
    # Title is derived from brand + name; both columns are searched independently.
    if search:
        ilike_pat = f"%{search}%"
        base_q = base_q.filter(or_(
            Listing.brand.ilike(ilike_pat),
            Listing.name.ilike(ilike_pat),
            Listing.description.ilike(ilike_pat),
            Listing.tags.ilike(ilike_pat),
        ))

    # --- SQL: hard radius cap bounding-box prefilter (requires buyer location) ---
    if buyer is not None:
        base_q = _bbox_filter(base_q, buyer[0], buyer[1], FEED_MAX_RADIUS_MI)

    # --- Fetch candidate rows depending on path ---
    # We need to apply community/visibility filtering in Python (JSON column
    # content can't be cleanly queried in SQLite; Postgres JSON operators are
    # available but the current schema stores communities as a JSON string with
    # mixed int/string values making SQL-side intersection fragile). The radius
    # cap + status/expiry + category/search filters pushed to SQL already cut the
    # candidate set dramatically.

    # All paths use offset-based pagination for correctness: the final sort order
    # in all non-FYP paths may differ from SQL order (community tier, relevance,
    # price) so keyset cursors on (posted_at, id) would produce duplicates after
    # a Python reorder. Offset is simpler and correct for MVP scale.
    #
    # FYP path: bounded to _FYP_CANDIDATE_WINDOW so scoring stays fast.
    # Browse/search/sort paths: bounded to a reasonable candidate cap.
    _BROWSE_CANDIDATE_CAP = 500  # fetch at most this many rows before Python sorts

    # Resolve the page offset from cursor.
    # For FYP, the cursor also carries the `now` used on page 1 so that the
    # freshness-based scores are identical across all page requests (preventing
    # sort-order drift that would produce duplicate ids at page boundaries).
    decoded_cursor: dict | None = _decode_cursor(cursor) if cursor else None
    page_offset = 0
    # `scoring_now` is the timestamp used for FYP scoring. On page 1 (no cursor),
    # it equals `now`. On page 2+, it is read from the cursor so scores are stable.
    scoring_now: float = now
    if decoded_cursor and "offset" in decoded_cursor:
        page_offset = int(decoded_cursor["offset"])
        if "now" in decoded_cursor:
            scoring_now = float(decoded_cursor["now"])

    if fyp_mode and not search and sort not in ("price_low", "price_high"):
        # FYP path: bounded window of the most recent candidates, scored + ranked.
        candidate_orm_rows = (
            base_q
            .order_by(Listing.posted_at.desc(), Listing.id.desc())
            .limit(_FYP_CANDIDATE_WINDOW)
            .all()
        )
    else:
        # Browse/search/sort path: fetch a bounded candidate window, Python-sort,
        # then page via offset. Bounded to _BROWSE_CANDIDATE_CAP.
        candidate_orm_rows = (
            base_q
            .order_by(Listing.posted_at.desc(), Listing.id.desc())
            .limit(_BROWSE_CANDIDATE_CAP)
            .all()
        )

    # ---------------------------------------------------------------------------
    # Convert to dicts, compute distance, apply haversine fine-filter for radius cap
    # ---------------------------------------------------------------------------

    rows_by_id: dict[str, Listing] = {r.id: r for r in candidate_orm_rows}
    results: list[dict] = [r.to_dict() for r in candidate_orm_rows]

    for item in results:
        lat, lng = item.get("latitude"), item.get("longitude")
        if buyer is not None and lat is not None and lng is not None:
            d = round(haversine_miles(buyer[0], buyer[1], lat, lng), 1)
            item["distance_miles"] = d
        else:
            item["distance_miles"] = None

    # Fine-grained haversine filter to drop bbox-false-positives beyond cap.
    if buyer is not None:
        results = [
            it for it in results
            if it["distance_miles"] is not None and it["distance_miles"] <= FEED_MAX_RADIUS_MI
        ]
        rows_by_id = {k: v for k, v in rows_by_id.items() if k in {r["id"] for r in results}}

    # max_distance is a CLIENT-SIDE slider that further restricts the feed beyond
    # the hard cap. Still applied here so server-side pagination is consistent.
    if max_distance is not None and buyer is not None:
        results = [it for it in results if it["distance_miles"] is not None and it["distance_miles"] <= max_distance]
        rows_by_id = {k: v for k, v in rows_by_id.items() if k in {r["id"] for r in results}}

    # ---------------------------------------------------------------------------
    # Visibility / community filtering (Python, preserves existing semantics)
    # ---------------------------------------------------------------------------

    poster_ids = {l.get("userId") for l in results if l.get("userId")}
    poster_map: dict[str, User] = {}
    if poster_ids:
        poster_map = {u.id: u for u in db.query(User).filter(User.id.in_(poster_ids)).all()}

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

    # ---------------------------------------------------------------------------
    # Tag filter (fast Python pass on already-filtered set)
    # ---------------------------------------------------------------------------

    if tag and tag != "All":
        results = [
            l for l in results
            if tag.lower() in [t.lower() for t in l.get("tags", [])]
        ]

    # ---------------------------------------------------------------------------
    # Sorting + pagination
    # ---------------------------------------------------------------------------

    next_cursor: str | None = None

    if search:
        # Search relevance ordering (tier + title-match rank + recency).
        q_lower = search.lower()

        def _relevance(l: dict):
            title = l.get("title", "").lower()
            if title == q_lower:
                ts = 0
            elif title.startswith(q_lower):
                ts = 1
            elif q_lower in title:
                ts = 2
            else:
                ts = 3
            return (ts, _tier(l), -l.get("postedAt", 0), l.get("id", ""))

        results.sort(key=_relevance)
        page = results[page_offset: page_offset + limit]
        if page_offset + limit < len(results):
            next_cursor = _encode_cursor({"offset": page_offset + limit})
        results = page

    elif sort == "price_low":
        results.sort(key=lambda l: (_tier(l), float(l.get("price", 0)), l.get("id", "")))
        page = results[page_offset: page_offset + limit]
        if page_offset + limit < len(results):
            next_cursor = _encode_cursor({"offset": page_offset + limit})
        results = page

    elif sort == "price_high":
        results.sort(key=lambda l: (_tier(l), -float(l.get("price", 0)), l.get("id", "")))
        page = results[page_offset: page_offset + limit]
        if page_offset + limit < len(results):
            next_cursor = _encode_cursor({"offset": page_offset + limit})
        results = page

    elif fyp_mode:
        # FYP path: score the bounded candidate window, then paginate by offset.
        # Cursor encodes {"offset": <int>, "now": <float>} so that the freshness
        # component of the score is computed from the SAME baseline timestamp on
        # every page, preventing sort-order drift that would produce duplicate ids.
        candidate_rows_for_fyp = [
            rows_by_id[l["id"]] for l in results if l["id"] in rows_by_id
        ]
        kept_rows = _fyp_apply_exclusions(current_user, candidate_rows_for_fyp, db)
        kept_ids = {r.id for r in kept_rows}
        scored = score_listings(current_user, kept_rows, db, scoring_now)
        score_by_id: dict[str, float] = {r.id: s for r, s in scored}
        results = [l for l in results if l["id"] in kept_ids]
        results.sort(
            key=lambda l: (
                -score_by_id.get(l["id"], 0.0),
                -l.get("postedAt", 0),
                l.get("id", ""),   # stable tiebreaker
            )
        )
        page = results[page_offset: page_offset + limit]
        if page_offset + limit < len(results):
            next_cursor = _encode_cursor({"offset": page_offset + limit, "now": scoring_now})
        results = page

    else:
        # Default browse (sort=newest or unrecognised): (tier asc, postedAt desc).
        results.sort(key=lambda l: (_tier(l), -l.get("postedAt", 0), l.get("id", "")))
        page = results[page_offset: page_offset + limit]
        if page_offset + limit < len(results):
            next_cursor = _encode_cursor({"offset": page_offset + limit})
        results = page

    # ---------------------------------------------------------------------------
    # Enrich response (same logic as before)
    # ---------------------------------------------------------------------------

    all_community_ids_set: set[int] = set()
    for l in results:
        for cid in l.get("communities", []):
            if isinstance(cid, int):
                all_community_ids_set.add(cid)
    community_info_map: dict[int, dict] = {}
    if all_community_ids_set:
        for c in db.query(Community).filter(Community.id.in_(all_community_ids_set)).all():
            community_info_map[c.id] = {"name": c.name, "is_public": c.is_public, "image": c.image}

    # Refresh poster_map after visibility filtering narrowed the result set.
    poster_ids = {l.get("userId") for l in results if l.get("userId")}
    poster_map = {u.id: u for u in db.query(User).filter(User.id.in_(poster_ids)).all()} if poster_ids else {}

    distinct_seller_ids = list({l["userId"] for l in results if l.get("userId")})
    circles_batch: dict[str, dict] = seller_circles_for_viewer_batch(
        db,
        distinct_seller_ids,
        current_user,
        viewer_circle_ids=my_community_ids,
        seller_map=poster_map,
    )

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
        seller_id = l.get("userId")
        listing_copy["circles"] = circles_batch.get(seller_id, EMPTY_CIRCLES) if seller_id else EMPTY_CIRCLES
        enriched.append(listing_copy)

    return {"items": enriched, "nextCursor": next_cursor}


@router.get("/api/listings/public")
def get_public_listings(
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    community: Optional[str] = Query(None),
    limit: int = Query(_DEFAULT_PAGE_LIMIT),
    cursor: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Paginated public feed for anonymous users (no auth required).

    Returns ``{"items": [...], "nextCursor": <str|null>}``.  Each item dict is
    byte-identical to what ``Listing.to_dict()`` returned before this change.
    Only public-visibility listings are included; no distance_miles (no user location).

    Cursor encoding: base64({"pa": <postedAt float>, "id": <str>}) — same keyset
    as the authenticated endpoint.
    """
    now = time.time()
    cutoff = now - LISTING_EXPIRY_SECONDS

    limit = max(1, min(limit, 100))

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

    # ---------------------------------------------------------------------------
    # SQL: push down status/expiry/category/search filters
    # ---------------------------------------------------------------------------

    base_q = db.query(Listing).filter(
        Listing.posted_at >= cutoff,
        Listing.status != "sold",
        # Public-only: only explicitly public listings (visibility == "public").
        # Listings with NULL or "private" visibility are excluded at SQL level
        # where possible; the remaining community-based cases are handled in Python.
        Listing.visibility == "public",
    )

    if category:
        cat_list = [c.strip().lower() for c in category.split(",") if c.strip()]
        if cat_list:
            base_q = base_q.filter(func.lower(Listing.category).in_(cat_list))

    if search:
        ilike_pat = f"%{search}%"
        base_q = base_q.filter(or_(
            Listing.brand.ilike(ilike_pat),
            Listing.name.ilike(ilike_pat),
            Listing.description.ilike(ilike_pat),
            Listing.tags.ilike(ilike_pat),
        ))

    # Resolve the page offset from cursor (offset-based pagination, same approach
    # as the authenticated endpoint for consistency).
    decoded_cursor: dict | None = _decode_cursor(cursor) if cursor else None
    page_offset = 0
    if decoded_cursor and "offset" in decoded_cursor:
        page_offset = int(decoded_cursor["offset"])

    _PUB_CANDIDATE_CAP = 500
    candidate_orm_rows = (
        base_q
        .order_by(Listing.posted_at.desc(), Listing.id.desc())
        .limit(_PUB_CANDIDATE_CAP)
        .all()
    )

    results: list[dict] = [r.to_dict() for r in candidate_orm_rows]

    # ---------------------------------------------------------------------------
    # Visibility / community filtering (Python, same semantics as before)
    # ---------------------------------------------------------------------------

    if community and community != "All":
        parts = [c.strip() for c in community.split(",") if c.strip()]
        filtered_pub: list[dict] = []
        for listing in results:
            norm_cids = [_ncid(c) for c in listing.get("communities", [])]
            for part in parts:
                try:
                    cid = int(part)
                except ValueError:
                    continue
                if cid in norm_cids and cid in all_public_ids:
                    filtered_pub.append(listing)
                    break
        results = filtered_pub
    else:
        results = [l for l in results if _is_public_listing(l)]

    if tag and tag != "All":
        results = [l for l in results if tag.lower() in [t.lower() for t in l.get("tags", [])]]

    # ---------------------------------------------------------------------------
    # Sorting + pagination (offset-based for stable ordering after Python sort)
    # ---------------------------------------------------------------------------

    next_cursor: str | None = None

    if sort == "price_low":
        results.sort(key=lambda l: (float(l.get("price", 0)), l.get("id", "")))
    elif sort == "price_high":
        results.sort(key=lambda l: (-float(l.get("price", 0)), l.get("id", "")))
    else:
        # Newest (default): posted_at desc, id desc (already in SQL order).
        results.sort(key=lambda l: (-l.get("postedAt", 0), l.get("id", "")))

    page = results[page_offset: page_offset + limit]
    if page_offset + limit < len(results):
        next_cursor = _encode_cursor({"offset": page_offset + limit})
    results = page

    # ---------------------------------------------------------------------------
    # Enrich response (same shape as before)
    # ---------------------------------------------------------------------------

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

    # School-only circles for the signed-out feed.
    pub_circles_batch = public_seller_circles_batch(db, list(pub_poster_ids))

    enriched_pub = []
    for l in results:
        listing_copy = dict(l)
        listing_copy["visibility"] = "public"
        seller_id = l.get("userId")
        poster = pub_poster_map.get(seller_id)
        listing_copy["seller_name"] = poster.display_name if poster else None
        listing_copy["seller_picture"] = poster.profile_picture if poster else None
        if poster and poster.neighborhood:
            listing_copy["location"] = poster.neighborhood
        all_comms = []
        for cid in l.get("communities", []):
            if isinstance(cid, int) and cid in pub_info:
                if pub_info[cid].get("is_public", True):
                    all_comms.append({**pub_info[cid], "is_mutual": False})
        all_comms.sort(key=lambda c: c["name"])
        listing_copy["allCommunities"] = all_comms
        listing_copy["circles"] = pub_circles_batch.get(seller_id, EMPTY_CIRCLES) if seller_id else EMPTY_CIRCLES
        enriched_pub.append(listing_copy)

    return {"items": enriched_pub, "nextCursor": next_cursor}


@router.get("/api/listings/mine")
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

    # Task A: seller == viewer for every listing in /mine, so circles is
    # identical across all rows.  Compute once and reuse (read-only in response).
    my_circles = seller_circles_for_viewer(
        db,
        current_user.id,
        current_user,
        viewer_circle_ids=my_community_ids,
        seller=current_user,
    )

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

        # Attach circles — same dict for every listing (seller == viewer).
        listing_copy["circles"] = my_circles

        enriched.append(listing_copy)
    return enriched


@router.get("/api/listings/{listing_id}")
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
    listing = get_listing_or_404(listing_id, db)

    result = listing.to_dict()

    # --- walk_minutes ---
    walk: int | None = None
    _tok = _get_mapbox_token()
    if (
        _tok
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
                        _tok,
                    )
                _walk_cache[cache_key] = walk

    result["walk_minutes"] = walk

    # --- circles ---
    seller_id = listing.user_id
    if current_user is not None:
        # Authed: full enrichment — connection degree + school with isMine.
        result["circles"] = seller_circles_for_viewer(db, seller_id, current_user)
    else:
        # Signed-out: school-only (degree always None, isMine always False).
        pub_circles = public_seller_circles_batch(db, [seller_id])
        result["circles"] = pub_circles.get(seller_id, EMPTY_CIRCLES)

    return result


@router.get("/api/listings/{listing_id}/map.png")
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
    listing = get_listing_or_404(listing_id, db)

    _tok = _get_mapbox_token()
    if not _tok or listing.latitude is None or listing.longitude is None:
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
        png_bytes = fetch_static_map_png(c_lat, c_lng, radius, _tok)
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


@router.post("/api/listings/{listing_id}/relist")
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


@router.put("/api/listings/{listing_id}")
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


@router.delete("/api/listings/{listing_id}", status_code=204)
def delete_listing(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = get_listing_or_404(listing_id, db)
    assert_listing_owner(listing, current_user.id)
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
