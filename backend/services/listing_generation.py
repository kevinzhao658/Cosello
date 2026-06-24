"""AI listing-generation pipeline helpers.

This module owns:
- Image preprocessing (Pillow resize, EXIF orientation, JPEG normalisation)
- Google Vision result serialisation helpers
- Claude segmentation logic (_segment_with_claude and friends)
- Claude listing-synthesis helpers (_build_listing_prompt_for_group,
  _call_claude_listing_sync, _generate_one_listing_async)
- Prompt-text constants (DESCRIPTION_VOICE_INSTRUCTIONS, RATIONALE_OPTIONS, etc.)
- format_title and _normalize_brand_hint utility functions

`client` and `vision` are accessed via lazy getters (_get_client / _get_vision)
so that tests can monkeypatch `main.client` and `main.vision` and have those
patches take effect inside this module without a circular import.
"""

import asyncio
import base64
import io
import json
import logging
import os

import anthropic
from PIL import Image, ImageOps

from services import storage
from services.evidence import build_evidence_block, _format_single_image_evidence
from services.google import vision as _vision_module
from services.google.vision import VisionResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Anthropic client — reads ANTHROPIC_API_KEY from env.
# Tests monkeypatch `main.client` to swap in a fake; the getters below read
# from main at call time so the patch takes effect without circular imports.
# ---------------------------------------------------------------------------
client = anthropic.Anthropic()

# Keep a module-level alias so `from services.google import vision` still works.
vision = _vision_module


def _get_client():
    """Return the live Anthropic client, preferring `main.client` for testability."""
    try:
        import main as _main
        return _main.client
    except (ImportError, AttributeError):
        return client


def _get_vision():
    """Return the live vision module, preferring `main.vision` for testability."""
    try:
        import main as _main
        return _main.vision
    except (ImportError, AttributeError):
        return _vision_module

# ---------------------------------------------------------------------------
# Image size constants
# ---------------------------------------------------------------------------
MAX_IMAGE_BYTES = 3_500_000
MAX_IMAGE_DIMENSION = 2048

SEGMENTATION_THUMBNAIL_DIM = 768

# ---------------------------------------------------------------------------
# Allowed file extensions for signed-upload URLs
# ---------------------------------------------------------------------------
_SIGNED_UPLOAD_ALLOWED_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}


# ---------------------------------------------------------------------------
# Rationale options (validated by /api/generate-listings)
# ---------------------------------------------------------------------------
RATIONALE_OPTIONS: tuple[str, ...] = (
    "",
    "Moving",
    "Upgrading",
    "No longer fits",
    "Gift never used",
    "Decluttering",
    "Other",
)


# ---------------------------------------------------------------------------
# Prompt-text constant: description voice instructions for Claude
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Image preprocessing
# ---------------------------------------------------------------------------

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


async def _save_uploaded_images(images: list) -> tuple[list[bytes], list[str]]:
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


# ---------------------------------------------------------------------------
# Google Vision helpers
# ---------------------------------------------------------------------------

def _run_vision_with_cache(resized_bytes_list: list[bytes]) -> tuple[list, bool]:
    """Run Google Vision on images. Returns (VisionResults, retrieval_fallback).

    The phash-based dedup cache was removed when imagehash+scipy were dropped to
    fit Vercel's 250 MB bundle cap. At MVP scale per-image cost (~$0.0015) is
    negligible; reintroduce a numpy-only inline pHash dedup if Vision spend
    becomes material. See docs/COMMERCIAL_PR_CHECKLIST.md.
    """
    try:
        vision_results = _get_vision().analyze_images(resized_bytes_list)
        return vision_results, False
    except Exception as e:
        logger.warning("Google Vision call failed, falling back to visual-only: %s", e)
        return [], True


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


# ---------------------------------------------------------------------------
# Segmentation helpers
# ---------------------------------------------------------------------------

def _build_segmentation_prompt(n: int) -> str:
    return (
        f"You are a photo grouper for a marketplace listing tool. The seller has uploaded {n} photos. "
        "Some photos may show the same item from different angles; others may show distinct items.\n\n"
        "Group the images by which depict the same physical item. Return ONLY a JSON array. "
        f"Each element is an array of image indices that belong together. Every index 0..{n - 1} must appear in exactly one group.\n\n"
        "IMPORTANT: Err strongly on the side of SEPARATING items. Only group images together if you are highly confident "
        "they show the exact same physical object (e.g., multiple angles of the same chair). "
        "If two photos show different types of objects (e.g., a laptop and a coffee table), they MUST be in separate groups.\n\n"
        "Examples: 3 angles of one chair -> [[0, 1, 2]]; chair + lamp -> [[0], [1]]; laptop + table + treadmill -> [[0], [1], [2]].\n\n"
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
        response = _get_client().messages.create(
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


# ---------------------------------------------------------------------------
# Listing-synthesis helpers
# ---------------------------------------------------------------------------

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

    response = _get_client().messages.create(
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
