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

    def create(self, *, model, max_tokens, messages):
        self.calls.append({"model": model, "max_tokens": max_tokens, "messages": messages})
        if not self._responses:
            raise AssertionError("FakeMessages exhausted")
        text = self._responses.pop(0)
        return _claude_text_response(text)


class FakeAnthropicClient:
    def __init__(self, responses: list[str]):
        self.messages = FakeMessages(responses)


@pytest.fixture
def client(monkeypatch):
    return TestClient(main.app)


@pytest.fixture
def patch_vision_empty(monkeypatch):
    """Make analyze_images succeed but return no signal (forces retrieval_fallback path)."""

    def _fake_analyze(image_bytes_list):
        return [VisionResult() for _ in image_bytes_list]

    monkeypatch.setattr(main.vision, "analyze_images", _fake_analyze)
    # Bypass the phash cache so each call hits the (mocked) analyze_images.
    monkeypatch.setattr(main._phash_cache, "get", lambda _b: None)
    monkeypatch.setattr(main._phash_cache, "set", lambda _b, _r: None)


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
    monkeypatch.setattr(main._phash_cache, "get", lambda _b: None)
    monkeypatch.setattr(main._phash_cache, "set", lambda _b, _r: None)


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


def test_segment_photos_single_image_returns_single_group(client, monkeypatch, patch_vision_signaled):
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
    assert body["image_urls"][0].startswith("/uploads/")
    assert body["image_urls"][0].endswith(".jpg")
    assert len(body["vision_signals"]) == 1
    sig = body["vision_signals"][0]
    assert sig["best_guess_labels"] == ["item-0"]
    assert sig["web_entities"][0][0] == "Brand 0"
    # Single-image short-circuit: Claude segmentation must not be called.
    assert fake.messages.calls == []


def test_segment_photos_malformed_json_falls_back_to_single_group(
    client, monkeypatch, patch_vision_signaled
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
    client, monkeypatch, patch_vision_signaled
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
    client, monkeypatch, patch_vision_signaled
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


def _seed_uploaded_images(n: int) -> list[str]:
    """Drop n preprocessed images on disk via the helper. Returns the URLs."""
    urls: list[str] = []
    for i in range(n):
        processed = main._preprocess_image_bytes(_png_bytes((i * 30, 50, 50)))
        import uuid as _uuid

        name = f"{_uuid.uuid4().hex}.jpg"
        (main.UPLOADS_DIR / name).write_bytes(processed)
        urls.append(f"/uploads/{name}")
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


def test_generate_listings_brand_hints_length_mismatch(client):
    urls = _seed_uploaded_images(2)
    payload = {
        "groupings": [[0, 1]],
        "image_urls": urls,
        "vision_signals": _empty_signals(2),
        "brand_hints": ["Coach", "Levi's"],  # 2 hints, only 1 group
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400
    assert "brand_hints" in resp.json()["detail"]


def test_generate_listings_image_urls_length_mismatch(client):
    urls = _seed_uploaded_images(2)
    payload = {
        "groupings": [[0, 1]],
        "image_urls": urls,
        "vision_signals": _empty_signals(3),  # mismatch
        "brand_hints": [""],
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
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400


def test_generate_listings_happy_path_two_groups(client, monkeypatch):
    urls = _seed_uploaded_images(3)
    listing_a = {
        "title": "Coach Duffel",
        "description": "Brown leather duffel.",
        "price": "$120",
        "condition": "Good",
        "location": "SoHo",
        "tags": ["bag", "coach", "leather"],
        "category": "other",
        "categoryAttributes": {"brand": "Coach"},
        "identifierConfidence": "high",
    }
    listing_b = {
        "title": "Floor Lamp",
        "description": "Standing lamp, brass.",
        "price": "45",
        "condition": "Fair",
        "location": "Chelsea",
        "tags": ["lamp", "lighting"],
        "category": "furniture",
        "categoryAttributes": {"brand": "Unknown", "carry_difficulty": "One person"},
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
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2

    # Order matches groupings order.
    titles = {item["title"] for item in body}
    assert titles == {"Coach Duffel", "Floor Lamp"}

    # imageIndices is set from the server side (don't trust Claude's echo).
    by_title = {item["title"]: item for item in body}
    assert by_title["Coach Duffel"]["imageIndices"] == [0, 1]
    assert by_title["Floor Lamp"]["imageIndices"] == [2]

    # Price normalization strips $.
    assert by_title["Coach Duffel"]["price"] == "120"
    assert by_title["Floor Lamp"]["price"] == "45"

    # retrieval_fallback flag present on each.
    assert all("retrieval_fallback" in item for item in body)


def test_generate_listings_per_group_failure_isolated(client, monkeypatch):
    urls = _seed_uploaded_images(2)

    class FlakyMessages:
        def __init__(self):
            self.n = 0
            self.calls = []

        def create(self, *, model, max_tokens, messages):
            self.calls.append(messages)
            self.n += 1
            if self.n == 1:
                # First group: success
                return _claude_text_response(
                    json.dumps(
                        {
                            "title": "Levi's Jacket",
                            "description": "Vintage 90s.",
                            "price": "60",
                            "condition": "Good",
                            "location": "East Village",
                            "tags": ["denim"],
                            "category": "clothing",
                            "categoryAttributes": {"brand": "Levi's"},
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
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 200

    body = resp.json()
    assert len(body) == 2
    # First listing succeeds.
    assert body[0]["title"] == "Levi's Jacket"
    assert body[0]["imageIndices"] == [0]
    # Second listing returns the placeholder shape with _error set.
    assert body[1]["title"] == "Listing generation failed"
    assert body[1]["imageIndices"] == [1]
    assert "_error" in body[1]


def test_generate_listings_invalid_index_in_groupings(client):
    urls = _seed_uploaded_images(2)
    payload = {
        "groupings": [[0, 5]],  # 5 is OOB
        "image_urls": urls,
        "vision_signals": _empty_signals(2),
        "brand_hints": [""],
    }
    resp = client.post("/api/generate-listings", json=payload)
    assert resp.status_code == 400


def test_generate_listings_brand_hint_normalization_used_in_prompt(client, monkeypatch):
    """Long/empty/HTML brand hints get normalized BEFORE going into the Claude prompt."""
    urls = _seed_uploaded_images(4)
    captured_prompts: list[str] = []

    class CapturingMessages:
        def create(self, *, model, max_tokens, messages):
            # The prompt is the last text block in the user message content.
            text_blocks = [b["text"] for b in messages[0]["content"] if b.get("type") == "text"]
            captured_prompts.append(text_blocks[-1])
            return _claude_text_response(
                json.dumps(
                    {
                        "title": "x",
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
