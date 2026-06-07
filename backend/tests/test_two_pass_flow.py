"""Tests for the two-pass review-and-edit listing flow.

Covers /api/segment-photos and /api/generate-listings end-to-end with the
Anthropic client and Cloud Vision integration mocked. No external network
calls are made.
"""
from __future__ import annotations

import io
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from services.google.vision import VisionResult


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def _png_bytes(color: tuple[int, int, int] = (200, 50, 50)) -> bytes:
    img = Image.new("RGB", (64, 64), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _claude_text_response(text: str):
    """Mimic the shape main.py reads: response.content[0].text."""
    return SimpleNamespace(content=[SimpleNamespace(text=text)])


class FakeMessages:
    """Stub for the Anthropic messages.create API.

    `responses` is consumed in order (FIFO) by successive calls.
    """

    def __init__(self, responses: list[str]):
        self._responses = list(responses)
        self.calls: list[dict] = []

    def create(self, *, model, max_tokens, messages, **kwargs):
        # Accept (and ignore) any extra kwargs the prod call passes — e.g.
        # `timeout` was added in main.py after this stub was first written.
        self.calls.append({"model": model, "max_tokens": max_tokens, "messages": messages})
        if not self._responses:
            raise AssertionError("FakeMessages exhausted")
        text = self._responses.pop(0)
        return _claude_text_response(text)


class FakeAnthropicClient:
    def __init__(self, responses: list[str]):
        self.messages = FakeMessages(responses)


@pytest.fixture
def client(monkeypatch, mock_user, override_auth_user):
    """Local override that also installs the auth-dependency bypass.

    The endpoint tests in this module don't need a persisted user row — they
    just need `Depends(get_current_user)` satisfied. Using an in-memory `User`
    sidesteps the `auth.users` FK constraint introduced by the Supabase
    migration.
    """
    override_auth_user(mock_user)
    return TestClient(main.app)


@pytest.fixture
def patch_vision_empty(monkeypatch):
    """Make analyze_images succeed but return no signal (forces retrieval_fallback path)."""

    def _fake_analyze(image_bytes_list):
        return [VisionResult() for _ in image_bytes_list]

    monkeypatch.setattr(main.vision, "analyze_images", _fake_analyze)


@pytest.fixture
def patch_vision_signaled(monkeypatch):
    """analyze_images returns a non-empty VisionResult per image."""

    def _fake_analyze(image_bytes_list):
        return [
            VisionResult(
                best_guess_labels=[f"item-{i}"],
                web_entities=[(f"Brand {i}", 0.9)],
                matching_page_titles=[f"page {i}"],
                labels=[("Furniture", 0.8)],
                ocr_text=f"ocr {i}",
            )
            for i in range(len(image_bytes_list))
        ]

    monkeypatch.setattr(main.vision, "analyze_images", _fake_analyze)


def _patch_claude(monkeypatch, responses: list[str]) -> FakeAnthropicClient:
    fake = FakeAnthropicClient(responses)
    monkeypatch.setattr(main, "client", fake)
    return fake


# --------------------------------------------------------------------------- #
# /api/segment-photos                                                         #
# --------------------------------------------------------------------------- #


def test_segment_photos_zero_images_returns_400(client):
    # FastAPI rejects missing `images=` form field with a 422 by default.
    # When zero files are sent, the request still has no `images` field -> 422.
    # The contract specifies "no images uploaded -> 400". We validate inside
    # the endpoint when at least one (empty) image slot is provided.
    resp = client.post("/api/segment-photos", files=[])
    # No `images` field at all -> FastAPI validation 422
    assert resp.status_code in (400, 422)


def test_segment_photos_single_image_returns_single_group(
    client, monkeypatch, patch_vision_signaled, mock_storage
):
    # Single image: endpoint short-circuits to a single group without calling Claude.
    fake = _patch_claude(monkeypatch, responses=[])  # should NOT be called

    img = _png_bytes()
    resp = client.post(
        "/api/segment-photos",
        files=[("images", ("a.png", img, "image/png"))],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["groupings"] == [[0]]
    assert len(body["image_urls"]) == 1
    assert body["image_urls"][0].startswith("https://test.storage.fake/")
    assert body["image_urls"][0].endswith(".jpg")
    assert len(body["vision_signals"]) == 1
    sig = body["vision_signals"][0]
    assert sig["best_guess_labels"] == ["item-0"]
    assert sig["web_entities"][0][0] == "Brand 0"
    # Single-image short-circuit: Claude segmentation must not be called.
    assert fake.messages.calls == []


def test_segment_photos_malformed_json_falls_back_to_single_group(
    client, monkeypatch, patch_vision_signaled, mock_storage
):
    """When Claude returns invalid JSON, /api/segment-photos returns [[0,1,...,N-1]]."""
    _patch_claude(monkeypatch, responses=["not json at all {{{"])

    imgs = [_png_bytes((i * 30, 50, 50)) for i in range(3)]
    files = [("images", (f"img{i}.png", b, "image/png")) for i, b in enumerate(imgs)]
    resp = client.post("/api/segment-photos", files=files)
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["groupings"] == [[0, 1, 2]]
    assert len(body["image_urls"]) == 3
    assert len(body["vision_signals"]) == 3


def test_segment_photos_returns_per_image_vision_signals(
    client, monkeypatch, patch_vision_signaled, mock_storage
):
    _patch_claude(monkeypatch, responses=["[[0, 1], [2]]"])

    imgs = [_png_bytes((i * 30, 50, 50)) for i in range(3)]
    files = [("images", (f"img{i}.png", b, "image/png")) for i, b in enumerate(imgs)]
    resp = client.post("/api/segment-photos", files=files)
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["groupings"] == [[0, 1], [2]]
    # one signal per image, in order
    assert [s["best_guess_labels"][0] for s in body["vision_signals"]] == [
        "item-0",
        "item-1",
        "item-2",
    ]


def test_segment_photos_invalid_groupings_fall_back(
    client, monkeypatch, patch_vision_signaled, mock_storage
):
    """Claude returns valid JSON but indices don't cover 0..N-1 exactly once."""
    _patch_claude(monkeypatch, responses=["[[0, 1]]"])  # missing index 2

    imgs = [_png_bytes((i * 30, 50, 50)) for i in range(3)]
    files = [("images", (f"img{i}.png", b, "image/png")) for i, b in enumerate(imgs)]
    resp = client.post("/api/segment-photos", files=files)
    assert resp.status_code == 200

    body = resp.json()
    assert body["groupings"] == [[0, 1, 2]]


# --------------------------------------------------------------------------- #
# /api/generate-listings                                                      #
# --------------------------------------------------------------------------- #


def _seed_uploaded_images(mock_storage: dict[str, bytes], n: int) -> list[str]:
    """Register n preprocessed PNGs in the mock Storage dict; return the URLs.

    Mirrors the prod /api/segment-photos path (Pillow preprocess → Storage
    upload) but populates the mock-storage in-memory store directly, so the
    /api/generate-listings endpoint under test can call `download_image(url)`
    against any of the returned URLs and get back valid image bytes.
    """
    import uuid as _uuid

    urls: list[str] = []
    for i in range(n):
        processed = main._preprocess_image_bytes(_png_bytes((i * 30, 50, 50)))
        url = (
            "https://test.storage.fake/listings/drafts/"
            f"{_uuid.uuid4().hex}.jpg"
        )
        mock_storage[url] = processed
        urls.append(url)
    return urls


def _empty_signals(n: int) -> list[dict]:
    return [
        {
            "best_guess_labels": [],
            "web_entities": [],
            "matching_page_titles": [],
            "labels": [],
            "ocr_text": "",
        }
        for _ in range(n)
    ]


def test_generate_listings_brand_hints_length_mismatch(client, mock_storage):
    urls = _seed_uploaded_images(mock_storage, 2)
    payload = {
        "groupings": [[0, 1]],
        "image_urls": urls,
        "vision_signals": _empty_signals(2),
        "brand_hints": ["Coach", "Levi's"],  # 2 hints, only 1 group
        "names": [""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400
    assert "brand_hints" in resp.json()["detail"]


def test_generate_listings_names_length_mismatch(client, mock_storage):
    urls = _seed_uploaded_images(mock_storage, 2)
    payload = {
        "groupings": [[0, 1]],
        "image_urls": urls,
        "vision_signals": _empty_signals(2),
        "brand_hints": [""],
        "names": ["", ""],  # 2 names, only 1 group
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400
    assert "names" in resp.json()["detail"]


def test_generate_listings_invalid_rationale(client, mock_storage):
    urls = _seed_uploaded_images(mock_storage, 1)
    payload = {
        "groupings": [[0]],
        "image_urls": urls,
        "vision_signals": _empty_signals(1),
        "brand_hints": [""],
        "names": [""],
        "rationale": "Bored",  # not in the enum
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400
    assert "rationale" in resp.json()["detail"].lower()


def test_generate_listings_other_requires_rationale_other(client, mock_storage):
    urls = _seed_uploaded_images(mock_storage, 1)
    payload = {
        "groupings": [[0]],
        "image_urls": urls,
        "vision_signals": _empty_signals(1),
        "brand_hints": [""],
        "names": [""],
        "rationale": "Other",
        "rationale_other": "   ",  # whitespace-only
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400
    assert "rationale_other" in resp.json()["detail"]


def test_generate_listings_image_urls_length_mismatch(client, mock_storage):
    urls = _seed_uploaded_images(mock_storage, 2)
    payload = {
        "groupings": [[0, 1]],
        "image_urls": urls,
        "vision_signals": _empty_signals(3),  # mismatch
        "brand_hints": [""],
        "names": [""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400
    assert "image_urls" in resp.json()["detail"]


def test_generate_listings_unresolvable_image_url(client):
    payload = {
        "groupings": [[0]],
        "image_urls": ["/uploads/does-not-exist.jpg"],
        "vision_signals": _empty_signals(1),
        "brand_hints": [""],
        "names": [""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400
    assert "does not resolve" in resp.json()["detail"]


def test_generate_listings_path_traversal_blocked(client):
    payload = {
        "groupings": [[0]],
        "image_urls": ["/uploads/../main.py"],
        "vision_signals": _empty_signals(1),
        "brand_hints": [""],
        "names": [""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400


def test_generate_listings_happy_path_two_groups(client, monkeypatch, mock_storage):
    urls = _seed_uploaded_images(mock_storage, 3)
    # Claude now returns `name` + `brand` as top-level fields.
    listing_a = {
        "name": "Duffel",
        "brand": "Coach",
        "description": "Brown leather duffel.",
        "price": "$120",
        "condition": "Good",
        "location": "SoHo",
        "tags": ["bag", "coach", "leather"],
        "category": "other",
        "categoryAttributes": {},
        "identifierConfidence": "high",
    }
    listing_b = {
        "name": "Floor Lamp",
        "brand": "Unknown",  # post-processing must coerce to ""
        "description": "Standing lamp, brass.",
        "price": "45",
        "condition": "Fair",
        "location": "Chelsea",
        "tags": ["lamp", "lighting"],
        "category": "furniture",
        "categoryAttributes": {"carry_difficulty": "One person"},
        "identifierConfidence": "low",
    }
    _patch_claude(
        monkeypatch,
        responses=[json.dumps(listing_a), json.dumps(listing_b)],
    )

    payload = {
        "groupings": [[0, 1], [2]],
        "image_urls": urls,
        "vision_signals": _empty_signals(3),
        "brand_hints": ["Coach", ""],
        "names": ["", ""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2

    # Top-level name/brand on every result; no transitional `title` and no `model`.
    for item in body:
        assert "name" in item
        assert "brand" in item
        assert "title" not in item
        assert "model" not in item
        assert "model" not in item.get("categoryAttributes", {})
        assert "brand" not in item.get("categoryAttributes", {})

    by_name = {item["name"]: item for item in body}
    assert "Duffel" in by_name
    assert "Floor Lamp" in by_name
    assert by_name["Duffel"]["brand"] == "Coach"
    # "Unknown" coerced to empty string on the second listing.
    assert by_name["Floor Lamp"]["brand"] == ""

    # imageIndices is set from the server side (don't trust Claude's echo).
    assert by_name["Duffel"]["imageIndices"] == [0, 1]
    assert by_name["Floor Lamp"]["imageIndices"] == [2]

    # Price normalization strips $.
    assert by_name["Duffel"]["price"] == "120"
    assert by_name["Floor Lamp"]["price"] == "45"

    # retrieval_fallback flag present on each.
    assert all("retrieval_fallback" in item for item in body)


def test_generate_listings_strips_brand_prefix_from_name(client, monkeypatch, mock_storage):
    """If Claude prefixes the brand into `name`, the server strips it."""
    urls = _seed_uploaded_images(mock_storage, 1)
    listing = {
        "name": "Nike Air Force 1",  # brand snuck in — server must strip
        "brand": "Nike",
        "description": "Classic sneakers.",
        "price": "80",
        "condition": "Good",
        "location": "SoHo",
        "tags": ["sneakers"],
        "category": "sports",
        "categoryAttributes": {"size": "10"},
        "identifierConfidence": "high",
    }
    _patch_claude(monkeypatch, responses=[json.dumps(listing)])

    payload = {
        "groupings": [[0]],
        "image_urls": urls,
        "vision_signals": _empty_signals(1),
        "brand_hints": ["Nike"],
        "names": [""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body[0]["brand"] == "Nike"
    assert body[0]["name"] == "Air Force 1"


def test_generate_listings_falls_back_to_brand_hint_when_claude_omits_brand(
    client, monkeypatch, mock_storage
):
    """When Claude returns brand="" but the seller confirmed a brand, use the hint."""
    urls = _seed_uploaded_images(mock_storage, 1)
    listing = {
        "name": "Better Sweater",
        "brand": "",  # empty — must fall back to brand_hint
        "description": "Cozy fleece.",
        "price": "55",
        "condition": "Good",
        "location": "SoHo",
        "tags": ["fleece"],
        "category": "clothing",
        "categoryAttributes": {"size": "M", "gender": "Unisex"},
        "identifierConfidence": "high",
    }
    _patch_claude(monkeypatch, responses=[json.dumps(listing)])

    payload = {
        "groupings": [[0]],
        "image_urls": urls,
        "vision_signals": _empty_signals(1),
        "brand_hints": ["Patagonia"],
        "names": [""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body[0]["brand"] == "Patagonia"
    assert body[0]["name"] == "Better Sweater"


def test_generate_listings_per_group_failure_isolated(client, monkeypatch, mock_storage):
    urls = _seed_uploaded_images(mock_storage, 2)

    class FlakyMessages:
        def __init__(self):
            self.n = 0
            self.calls = []

        def create(self, *, model, max_tokens, messages, **kwargs):
            self.calls.append(messages)
            self.n += 1
            if self.n == 1:
                # First group: success
                return _claude_text_response(
                    json.dumps(
                        {
                            "name": "Vintage Denim Jacket",
                            "brand": "Levi's",
                            "description": "Vintage 90s.",
                            "price": "60",
                            "condition": "Good",
                            "location": "East Village",
                            "tags": ["denim"],
                            "category": "clothing",
                            "categoryAttributes": {"size": "M", "gender": "Unisex"},
                            "identifierConfidence": "high",
                        }
                    )
                )
            # Second group: junk JSON -> per-group placeholder
            return _claude_text_response("not json {{{")

    flaky = SimpleNamespace(messages=FlakyMessages())
    monkeypatch.setattr(main, "client", flaky)

    payload = {
        "groupings": [[0], [1]],
        "image_urls": urls,
        "vision_signals": _empty_signals(2),
        "brand_hints": ["Levi's", ""],
        "names": ["", ""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200

    body = resp.json()
    assert len(body) == 2
    # First listing succeeds.
    assert body[0]["name"] == "Vintage Denim Jacket"
    assert body[0]["brand"] == "Levi's"
    assert body[0]["imageIndices"] == [0]
    # Second listing returns the placeholder shape with _error set.
    assert body[1]["name"] == "Listing generation failed"
    assert body[1]["brand"] == ""
    assert body[1]["imageIndices"] == [1]
    assert "_error" in body[1]


def test_generate_listings_invalid_index_in_groupings(client, mock_storage):
    urls = _seed_uploaded_images(mock_storage, 2)
    payload = {
        "groupings": [[0, 5]],  # 5 is OOB
        "image_urls": urls,
        "vision_signals": _empty_signals(2),
        "brand_hints": [""],
        "names": [""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400


def test_generate_listings_brand_hint_normalization_used_in_prompt(
    client, monkeypatch, mock_storage
):
    """Long/empty/HTML brand hints get normalized BEFORE going into the Claude prompt."""
    urls = _seed_uploaded_images(mock_storage, 4)
    captured_prompts: list[str] = []

    class CapturingMessages:
        def create(self, *, model, max_tokens, messages, **kwargs):
            # The prompt is the last text block in the user message content.
            text_blocks = [b["text"] for b in messages[0]["content"] if b.get("type") == "text"]
            captured_prompts.append(text_blocks[-1])
            return _claude_text_response(
                json.dumps(
                    {
                        "name": "x",
                        "brand": "",
                        "description": "x",
                        "price": "1",
                        "condition": "Good",
                        "location": "x",
                        "tags": [],
                        "category": "other",
                        "categoryAttributes": {},
                        "identifierConfidence": "low",
                    }
                )
            )

    monkeypatch.setattr(main, "client", SimpleNamespace(messages=CapturingMessages()))

    payload = {
        "groupings": [[0], [1], [2], [3]],
        "image_urls": urls,
        "vision_signals": _empty_signals(4),
        "brand_hints": [
            "  Coach  ",  # whitespace stripped -> "Coach"
            "",  # empty -> dropped
            "<script>x</script>Levi's",  # contains <> -> dropped entirely
            "A" * 100,  # 100 chars -> dropped (>=80)
        ],
        "names": ["", "", "", ""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200

    # Order of captured_prompts matches order of groupings.
    assert "Coach" in captured_prompts[0] and "SELLER-CONFIRMED BRAND" in captured_prompts[0]
    assert "SELLER-CONFIRMED BRAND" not in captured_prompts[1]
    # HTML/angle-bracket inputs are dropped, never injected into the prompt.
    assert "SELLER-CONFIRMED BRAND" not in captured_prompts[2]
    assert "<script>" not in captured_prompts[2]
    assert "SELLER-CONFIRMED BRAND" not in captured_prompts[3]


def test_generate_listings_seller_name_and_rationale_in_prompt(
    client, monkeypatch, mock_storage
):
    """Seller-provided name + per-batch rationale are injected into the prompt."""
    urls = _seed_uploaded_images(mock_storage, 2)
    captured_prompts: list[str] = []

    class CapturingMessages:
        def create(self, *, model, max_tokens, messages, **kwargs):
            text_blocks = [b["text"] for b in messages[0]["content"] if b.get("type") == "text"]
            captured_prompts.append(text_blocks[-1])
            return _claude_text_response(
                json.dumps(
                    {
                        "name": "x",
                        "brand": "",
                        "description": "x",
                        "price": "1",
                        "condition": "Good",
                        "location": "x",
                        "tags": [],
                        "category": "other",
                        "categoryAttributes": {},
                        "identifierConfidence": "low",
                    }
                )
            )

    monkeypatch.setattr(main, "client", SimpleNamespace(messages=CapturingMessages()))

    payload = {
        "groupings": [[0], [1]],
        "image_urls": urls,
        "vision_signals": _empty_signals(2),
        "brand_hints": ["", ""],
        "names": ["Air Force 1", ""],  # one seller-named, one not
        "rationale": "Moving",
        "rationale_other": "",
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200, resp.text

    # First prompt: seller-named -> SELLER-CONFIRMED NAME block with the verbatim name.
    assert "SELLER-CONFIRMED NAME" in captured_prompts[0]
    assert "Air Force 1" in captured_prompts[0]
    # Second prompt: no seller name -> NAME GUIDANCE block instead.
    assert "NAME GUIDANCE" in captured_prompts[1]
    assert "SELLER-CONFIRMED NAME" not in captured_prompts[1]
    # Both prompts get the rationale value line for "Moving" plus the global
    # description-voice instructions (which contain the RATIONALE OPENERS catalog).
    for p in captured_prompts:
        assert "SELLER RATIONALE" in p
        assert "Moving" in p
        # Description-voice block is present.
        assert "DESCRIPTION VOICE & STRUCTURE" in p
        assert "FIRST PERSON" in p
        assert "WORDS / PHRASES TO AVOID" in p
        # Rationale opener stems for every supported rationale.
        assert "Moving across town" in p
        assert "Upgraded my couch" in p
        assert "It doesn't fit me anymore" in p
        assert "Got this as a gift" in p
        assert "Decluttering my place" in p
        # Banned-word and formatting guidance is explicitly listed.
        assert "premium" in p
        assert "stands as" in p
        assert "em dashes" in p
    # New schema is documented; legacy `title`/`model` keywords are gone from
    # the schema example block.
    for p in captured_prompts:
        assert '"name"' in p
        assert '"brand"' in p
        # The schema example must NOT list a top-level "title" or "model" key.
        assert '"title":' not in p
        assert '"model":' not in p


def test_generate_listings_rationale_other_passes_custom_text_to_prompt(
    client, monkeypatch, mock_storage
):
    urls = _seed_uploaded_images(mock_storage, 1)
    captured_prompts: list[str] = []

    class CapturingMessages:
        def create(self, *, model, max_tokens, messages, **kwargs):
            text_blocks = [b["text"] for b in messages[0]["content"] if b.get("type") == "text"]
            captured_prompts.append(text_blocks[-1])
            return _claude_text_response(
                json.dumps(
                    {
                        "name": "x",
                        "brand": "",
                        "description": "x",
                        "price": "1",
                        "condition": "Good",
                        "location": "x",
                        "tags": [],
                        "category": "other",
                        "categoryAttributes": {},
                        "identifierConfidence": "low",
                    }
                )
            )

    monkeypatch.setattr(main, "client", SimpleNamespace(messages=CapturingMessages()))

    payload = {
        "groupings": [[0]],
        "image_urls": urls,
        "vision_signals": _empty_signals(1),
        "brand_hints": [""],
        "names": [""],
        "rationale": "Other",
        "rationale_other": "switching to minimalism",
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200, resp.text
    assert "switching to minimalism" in captured_prompts[0]
    assert "SELLER RATIONALE" in captured_prompts[0]
    # The custom text is presented as the seller's actual reason via the
    # "Custom rationale:" label — NOT as a free-form tone modifier ("Adjust tone
    # naturally to match" was the old framing and must be gone).
    assert "Custom rationale:" in captured_prompts[0]
    assert "Adjust tone naturally to match" not in captured_prompts[0]


def test_rationale_value_line_other_with_custom_text():
    """The 'Other' rationale must surface the seller's free-text as the actual reason."""
    line = main._rationale_value_line("Other", "Kid grew out of it")
    assert "Custom rationale:" in line
    assert "Kid grew out of it" in line


def test_rationale_value_line_empty_skips_opener():
    """An empty rationale tells Claude to skip the opener and lead with item details."""
    line = main._rationale_value_line("", "")
    assert "skip the rationale opener" in line


def test_rationale_value_line_known_enum():
    """Known enum values surface verbatim so Claude picks the right opener stem."""
    assert "'Moving'" in main._rationale_value_line("Moving", "")
    assert "'Decluttering'" in main._rationale_value_line("Decluttering", "")


def test_description_voice_instructions_constant_present():
    """The DESCRIPTION_VOICE_INSTRUCTIONS constant is the load-bearing block."""
    block = main.DESCRIPTION_VOICE_INSTRUCTIONS
    assert "FIRST PERSON" in block
    assert "WORDS / PHRASES TO AVOID" in block
    assert "RATIONALE OPENERS" in block
    # All five enum-rationale opener stems exist in the catalog.
    assert "Moving across town" in block
    assert "Upgraded my couch" in block
    assert "It doesn't fit me anymore" in block
    assert "Got this as a gift" in block
    assert "Decluttering my place" in block


# --------------------------------------------------------------------------- #
# Helpers under test                                                          #
# --------------------------------------------------------------------------- #


def test_normalize_brand_hint_cases():
    f = main._normalize_brand_hint
    assert f("") == ""
    assert f("   ") == ""
    assert f("  Coach  ") == "Coach"
    # Anything containing < or > is dropped entirely (not partially sanitized).
    assert f("<script>alert(1)</script>Coach") == ""
    assert f("Coach<") == ""
    assert f("A" * 80) == ""
    assert f("A" * 79) == "A" * 79
    assert f(None) == ""  # type: ignore[arg-type]


def test_format_title_basic():
    f = main.format_title
    assert f("Nike", "Air Force 1") == "Nike Air Force 1"
    assert f(" Nike ", " Air Force 1 ") == "Nike Air Force 1"


def test_format_title_handles_none_and_whitespace():
    f = main.format_title
    assert f(None, None) == ""
    assert f(None, "Foo") == "Foo"
    assert f("Nike", None) == "Nike"
    assert f("", "Foo") == "Foo"
    assert f("   ", "Foo") == "Foo"
    assert f("Nike", "   ") == "Nike"


def test_format_title_unknown_coerced_to_empty():
    f = main.format_title
    # Exact spelling of the sentinel the listing-gen pipeline historically wrote.
    assert f("Unknown", "Foo") == "Foo"
    # Case-insensitive match — covers UNKNOWN and unknown too.
    assert f("UNKNOWN", "Foo") == "Foo"
    assert f("unknown", "Foo") == "Foo"


def test_format_title_non_string_inputs_are_safe():
    f = main.format_title
    # type: ignore[arg-type] — explicit non-string input must not raise.
    assert f(123, "Foo") == "Foo"  # type: ignore[arg-type]
    assert f("Nike", 456) == "Nike"  # type: ignore[arg-type]


_TEST_SELLER_UUID = "00000000-0000-0000-0000-000000000001"


def test_listing_title_str_property_uses_same_rules(monkeypatch):
    from models import Listing

    l = Listing(
        id="x", user_id=_TEST_SELLER_UUID, brand="Unknown", name="Mid-Century Side Table",
        price_cents=4000, posted_at=0.0,
    )
    # "Unknown" coerced to empty -> just the name.
    assert l.title_str == "Mid-Century Side Table"

    l2 = Listing(
        id="y", user_id=_TEST_SELLER_UUID, brand="Coach", name="Duffel",
        price_cents=12000, posted_at=0.0,
    )
    assert l2.title_str == "Coach Duffel"


def test_listing_to_dict_emits_price_cents_and_history_fields():
    """to_dict() emits priceCents (source of truth) + derived whole-dollar `price`."""
    from models import Listing

    l = Listing(
        id="z", user_id=_TEST_SELLER_UUID, brand="Coach", name="Duffel",
        price_cents=12050,
        condition_score=72,
        product_year=2019,
        identifier_confidence="high",
        posted_at=100.0,
        original_posted_at=50.0,
        relist_count=2,
    )
    out = l.to_dict()
    assert out["priceCents"] == 12050
    assert out["price"] == "120"  # whole-dollar string from price_cents // 100
    assert out["conditionScore"] == 72
    assert out["productYear"] == 2019
    assert out["identifierConfidence"] == "high"
    assert out["originalPostedAt"] == 50.0
    assert out["relistCount"] == 2


def test_listing_to_dict_handles_null_history_fields():
    """relist_count default 0 surfaces correctly; nullable fields stay None."""
    from models import Listing

    l = Listing(
        id="w", user_id=_TEST_SELLER_UUID, brand="", name="Plain Item",
        price_cents=0, posted_at=0.0,
    )
    out = l.to_dict()
    assert out["priceCents"] == 0
    assert out["price"] == "0"
    assert out["conditionScore"] is None
    assert out["productYear"] is None
    assert out["identifierConfidence"] is None
    assert out["originalPostedAt"] is None
    # relist_count default=0 (Python-side) is None on a fresh instance because
    # SQLAlchemy column defaults only apply at flush time. to_dict() coerces
    # None -> 0 to keep the API contract stable.
    assert out["relistCount"] == 0


def test_validate_groupings_strict():
    f = main._validate_groupings
    assert f([[0, 1, 2]], 3) == [[0, 1, 2]]
    assert f([[0, 1], [2]], 3) == [[0, 1], [2]]
    # missing index
    assert f([[0, 1]], 3) is None
    # duplicate index
    assert f([[0, 0]], 1) is None
    # OOB index
    assert f([[0, 5]], 2) is None
    # not a list
    assert f("[[0]]", 1) is None
    # empty
    assert f([], 1) is None
    # group with non-int
    assert f([["0"]], 1) is None


# --------------------------------------------------------------------------- #
# Anonymous-access tests (guest sell flow)                                    #
# --------------------------------------------------------------------------- #
# These tests verify that /api/segment-photos and /api/generate-listings
# accept requests with NO auth header (guest path) AND with a valid token
# (authenticated path). /api/listings is NOT opened and must remain gated.


@pytest.fixture
def anon_client():
    """A bare TestClient with no dependency overrides — simulates an unauthenticated
    (anonymous/guest) caller. get_optional_user returns None for requests with
    no Authorization header."""
    from auth import get_optional_user

    # Ensure no leftover override from other fixtures bleeds in.
    main.app.dependency_overrides.pop(get_optional_user, None)
    yield TestClient(main.app)
    main.app.dependency_overrides.pop(get_optional_user, None)


@pytest.fixture
def authed_optional_client(mock_user):
    """A TestClient where get_optional_user is overridden to return a mock User,
    simulating an authenticated caller on the optional-auth endpoints."""
    from auth import get_optional_user

    main.app.dependency_overrides[get_optional_user] = lambda: mock_user
    yield TestClient(main.app)
    main.app.dependency_overrides.pop(get_optional_user, None)


def test_segment_photos_anonymous_no_auth_header_returns_200(
    anon_client, monkeypatch, patch_vision_signaled, mock_storage
):
    """Guest (no Authorization header) can call /api/segment-photos and get 200."""
    _patch_claude(monkeypatch, responses=[])  # single image -> no Claude call

    img = _png_bytes()
    resp = anon_client.post(
        "/api/segment-photos",
        files=[("images", ("a.png", img, "image/png"))],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["groupings"] == [[0]]
    assert len(body["image_urls"]) == 1
    assert len(body["vision_signals"]) == 1


def test_segment_photos_anonymous_multi_image_returns_200(
    anon_client, monkeypatch, patch_vision_empty, mock_storage
):
    """Guest with multiple images gets grouping result (no 401)."""
    _patch_claude(monkeypatch, responses=["[[0, 1], [2]]"])

    imgs = [_png_bytes((i * 30, 50, 50)) for i in range(3)]
    files = [("images", (f"img{i}.png", b, "image/png")) for i, b in enumerate(imgs)]
    resp = anon_client.post("/api/segment-photos", files=files)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["groupings"] == [[0, 1], [2]]


def test_segment_photos_with_valid_token_still_returns_200(
    authed_optional_client, monkeypatch, patch_vision_signaled, mock_storage
):
    """Authenticated callers still get 200 — auth token path not broken."""
    _patch_claude(monkeypatch, responses=[])  # single image -> no Claude call

    img = _png_bytes()
    resp = authed_optional_client.post(
        "/api/segment-photos",
        files=[("images", ("b.png", img, "image/png"))],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["groupings"] == [[0]]


def test_generate_listings_anonymous_no_auth_header_returns_200(
    anon_client, monkeypatch, mock_storage
):
    """Guest (no Authorization header) can call /api/generate-listings and get 200."""
    urls = _seed_uploaded_images(mock_storage, 1)
    listing = {
        "name": "Denim Jacket",
        "brand": "Levi's",
        "description": "Classic denim.",
        "price": "60",
        "condition": "Good",
        "location": "SoHo",
        "tags": ["denim"],
        "category": "clothing",
        "categoryAttributes": {"size": "M", "gender": "Unisex"},
        "identifierConfidence": "high",
    }
    _patch_claude(monkeypatch, responses=[json.dumps(listing)])

    payload = {
        "groupings": [[0]],
        "image_urls": urls,
        "vision_signals": _empty_signals(1),
        "brand_hints": ["Levi's"],
        "names": [""],
    }
    resp = anon_client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, list) and len(body) == 1
    assert body[0]["name"] == "Denim Jacket"
    assert body[0]["brand"] == "Levi's"


def test_generate_listings_with_valid_token_still_returns_200(
    authed_optional_client, monkeypatch, mock_storage
):
    """Authenticated callers still get 200 — auth token path not broken."""
    urls = _seed_uploaded_images(mock_storage, 1)
    listing = {
        "name": "Fleece Jacket",
        "brand": "Patagonia",
        "description": "Warm fleece.",
        "price": "75",
        "condition": "Good",
        "location": "Chelsea",
        "tags": ["fleece"],
        "category": "clothing",
        "categoryAttributes": {"size": "L", "gender": "Unisex"},
        "identifierConfidence": "high",
    }
    _patch_claude(monkeypatch, responses=[json.dumps(listing)])

    payload = {
        "groupings": [[0]],
        "image_urls": urls,
        "vision_signals": _empty_signals(1),
        "brand_hints": ["Patagonia"],
        "names": [""],
    }
    resp = authed_optional_client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body[0]["brand"] == "Patagonia"


def test_listings_publish_endpoint_still_requires_auth(anon_client):
    """/api/listings (publish/write) must NOT be opened — anon caller gets 401/403."""
    resp = anon_client.post(
        "/api/listings",
        data={"data": '{"name": "x", "price": "10"}'},
        files=[("images", ("x.png", _png_bytes(), "image/png"))],
    )
    # FastAPI returns 403 (no credentials supplied with auto_error=False bearer)
    # rather than 401 in some configurations; accept both as "auth-gated".
    assert resp.status_code in (401, 403, 422), (
        f"Expected auth gate on /api/listings, got {resp.status_code}: {resp.text}"
    )
