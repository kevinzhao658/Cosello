"""Phase 2b — map pickup picker backend tests. All Mapbox HTTP is mocked."""
import io
import json
import pytest
import services.mapbox as mb


@pytest.fixture(autouse=True)
def _reset_server_caches():
    import main
    main._walk_cache.clear()
    main._map_png_cache.clear()
    yield
    main._walk_cache.clear()
    main._map_png_cache.clear()


# ---------------------------------------------------------------------------
# Task 2: Mapbox service unit tests
# ---------------------------------------------------------------------------

def test_radius_constants():
    assert mb.MIN_MAP_RADIUS_MI == 0.1
    assert mb.MAX_MAP_RADIUS_MI == 0.4
    assert mb.MAP_CIRCLE_RADIUS_MI == 0.15


def test_reverse_geocode_zip_parses_postcode(monkeypatch):
    class FakeResp:
        status_code = 200
        def json(self):
            return {"features": [{
                "geometry": {"type": "Point", "coordinates": [-73.998, 40.725]},
                "properties": {
                    "full_address": "123 Mercer St, New York, New York 10012, United States",
                    "name": "123 Mercer St",
                    "context": {
                        "postcode": {"name": "10012"},
                        "place": {"name": "New York"},
                    },
                },
            }]}
    monkeypatch.setattr(mb.httpx, "get", lambda *a, **k: FakeResp())
    assert mb.reverse_geocode_zip(40.725, -73.998, "tok") == (
        "10012",
        "123 Mercer St, New York, New York 10012, United States",
    )


def test_reverse_geocode_zip_none_on_error(monkeypatch):
    def boom(*a, **k):
        raise mb.httpx.ConnectError("down")
    monkeypatch.setattr(mb.httpx, "get", boom)
    assert mb.reverse_geocode_zip(40.725, -73.998, "tok") is None


# ---------------------------------------------------------------------------
# Task 3: create_listing pin path — shared fixtures
# ---------------------------------------------------------------------------

# Minimal 1×1 transparent PNG (same bytes used across test suite)
_FAKE_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
    b"\xff?\x03\x00\x06\xfc\x02\xfe\xa7V\xbd\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
)

_TEST_SELLER_UUID = "00000000-0000-0000-0000-000000000010"
_SEEDED_ZIP = "10012"
_PLACE_LABEL = "123 Mercer St, New York, New York 10012, United States"
_BROOKLYN_ZIP = "11201"
_BROOKLYN_LABEL = "200 Atlantic Ave, Brooklyn, New York 11201, United States"

# Centroids for seeded Manhattan ZIPs only
_ZIP_CENTROIDS = {
    "10012": (40.725, -73.998),
    "10014": (40.735, -74.006),
}


def _make_fake_db():
    """Minimal mock SQLAlchemy session for create_listing tests.

    Supports: query(Model).filter(...).first(), db.add(), db.commit().
    Community/CommunityMember queries always return None (no community posting).
    ZipCentroid lookups via db.get() handled by monkeypatching centroid_for_zip.
    """
    class _FakeQuery:
        def __init__(self):
            self._first_val = None

        def filter(self, *a, **kw):
            return self

        def first(self):
            return self._first_val

        def all(self):
            return []

        def order_by(self, *a):
            return self

    class _FakeSession:
        def __init__(self):
            self.added: list = []
            self.committed = False

        def query(self, model):
            return _FakeQuery()

        def get(self, model, key):
            return None

        def add(self, obj):
            self.added.append(obj)

        def commit(self):
            self.committed = True

    return _FakeSession()


def _make_post_form(
    *,
    pickup_zip: str = "99999",
    pickup_location: str = "",
    latitude: str = "",
    longitude: str = "",
    map_radius_mi: str = "",
) -> dict:
    """Build the multipart form dict for POST /api/listings."""
    return {
        "data": (None, json.dumps({
            "brand": "TestBrand",
            "name": "TestItem",
            "description": "Test description.",
            "priceCents": 1000,
            "condition": "Good",
            "tags": [],
            "category": "other",
            "categoryAttributes": {},
        })),
        "communities": (None, ""),
        "visibility": (None, "public"),
        "pickup_location": (None, pickup_location),
        "pickup_zip": (None, pickup_zip),
        "latitude": (None, latitude),
        "longitude": (None, longitude),
        "map_radius_mi": (None, map_radius_mi),
        "images": ("test.png", _FAKE_PNG, "image/png"),
    }


@pytest.fixture
def create_listing_client(monkeypatch):
    """TestClient wired with:
    - mock DB (no real Supabase)
    - mock storage (no real uploads)
    - fake current_user (no JWT)
    - _MAPBOX_TOKEN = "tok"

    Yields (client, db) so tests can inspect db.added[0] after posting.
    """
    import main
    from auth import get_current_user
    from database import get_db
    from models import User
    from services import storage, geo
    from fastapi.testclient import TestClient

    fake_user = User(
        id=_TEST_SELLER_UUID,
        display_name="Pin Test Seller",
        neighborhood="SoHo",
        pickup_address="",
        zip_code="10012",
    )

    fake_db = _make_fake_db()

    monkeypatch.setattr(main, "_MAPBOX_TOKEN", "tok")

    # Mock storage so no Supabase uploads happen
    _MOCK_PREFIX = "https://test.storage.fake/"

    def _fake_upload(category, owner_id, raw_bytes, ext):
        return f"{_MOCK_PREFIX}{category}/{owner_id}/0.{ext}"

    monkeypatch.setattr(storage, "upload_image", _fake_upload)
    monkeypatch.setattr(storage, "is_storage_url", lambda url: bool(url) and url.startswith(_MOCK_PREFIX))

    # Mock centroid_for_zip: seeded Manhattan ZIPs only
    monkeypatch.setattr(geo, "centroid_for_zip", lambda db, z: _ZIP_CENTROIDS.get(z))

    main.app.dependency_overrides[get_current_user] = lambda: fake_user
    main.app.dependency_overrides[get_db] = lambda: fake_db

    client = TestClient(main.app)
    yield client, fake_db

    main.app.dependency_overrides.pop(get_current_user, None)
    main.app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Task 3 tests: 6 cases from the plan
# ---------------------------------------------------------------------------

def test_pin_path_happy_path(create_listing_client, monkeypatch):
    """1. Pin path: reverse-geocode returns seeded Manhattan ZIP.

    - zip_code stored == "10012" (client-sent "99999" is IGNORED)
    - latitude == round(40.7251234, 3) == 40.725 (server rounds)
    - map_radius_mi == 0.2 (stored as supplied)
    """
    import services.mapbox as mapbox_mod

    monkeypatch.setattr(
        mapbox_mod, "reverse_geocode_zip",
        lambda lat, lng, tok: (_SEEDED_ZIP, _PLACE_LABEL),
    )

    client, fake_db = create_listing_client
    resp = client.post(
        "/api/listings",
        files=_make_post_form(
            latitude="40.7251234",
            longitude="-73.9986789",
            map_radius_mi="0.2",
            pickup_zip="99999",  # must be IGNORED on pin path
        ),
    )
    assert resp.status_code == 201, resp.text

    assert len(fake_db.added) == 1
    listing = fake_db.added[0]

    assert listing.zip_code == _SEEDED_ZIP, f"expected {_SEEDED_ZIP!r}, got {listing.zip_code!r}"
    from services.geo import round_coord
    assert listing.latitude == round_coord(40.7251234)
    assert listing.map_radius_mi == 0.2


def test_pin_path_non_manhattan_zip_400(create_listing_client, monkeypatch):
    """2. Non-Manhattan PIN: reverse returns Brooklyn ZIP → 400."""
    import services.mapbox as mapbox_mod

    monkeypatch.setattr(
        mapbox_mod, "reverse_geocode_zip",
        lambda lat, lng, tok: (_BROOKLYN_ZIP, _BROOKLYN_LABEL),
    )

    client, _ = create_listing_client
    resp = client.post(
        "/api/listings",
        files=_make_post_form(
            latitude="40.688",
            longitude="-73.990",
            map_radius_mi="0.15",
        ),
    )
    assert resp.status_code == 400, resp.text
    assert "Manhattan" in resp.json()["detail"]


def test_pin_path_geocode_failure_503(create_listing_client, monkeypatch):
    """3. Geocode failure: reverse_geocode_zip returns None → 503."""
    import services.mapbox as mapbox_mod

    monkeypatch.setattr(
        mapbox_mod, "reverse_geocode_zip",
        lambda lat, lng, tok: None,
    )

    client, _ = create_listing_client
    resp = client.post(
        "/api/listings",
        files=_make_post_form(
            latitude="40.725",
            longitude="-73.998",
            map_radius_mi="0.15",
        ),
    )
    assert resp.status_code == 503, resp.text
    assert "verify" in resp.json()["detail"].lower() or "location" in resp.json()["detail"].lower()


def test_pin_path_radius_out_of_bounds_400(create_listing_client, monkeypatch):
    """4. Radius out of bounds (0.05 < 0.1) → 400 mentioning 0.1 and 0.4."""
    import services.mapbox as mapbox_mod

    monkeypatch.setattr(
        mapbox_mod, "reverse_geocode_zip",
        lambda lat, lng, tok: (_SEEDED_ZIP, _PLACE_LABEL),
    )

    client, _ = create_listing_client
    resp = client.post(
        "/api/listings",
        files=_make_post_form(
            latitude="40.725",
            longitude="-73.998",
            map_radius_mi="0.05",
        ),
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "0.1" in detail and "0.4" in detail


def test_legacy_path_no_pin_fields(create_listing_client, monkeypatch):
    """5. Legacy path: no latitude/longitude, pickup_zip="10012" → 200, untouched.

    Reverse-geocode must NOT be called; stored zip_code == "10012".
    """
    import services.mapbox as mapbox_mod

    call_count = {"n": 0}

    def _should_not_be_called(*a, **k):
        call_count["n"] += 1
        return None

    monkeypatch.setattr(mapbox_mod, "reverse_geocode_zip", _should_not_be_called)

    client, fake_db = create_listing_client
    resp = client.post(
        "/api/listings",
        files=_make_post_form(pickup_zip="10012"),
    )
    assert resp.status_code == 201, resp.text

    assert call_count["n"] == 0, "reverse_geocode_zip must NOT be called on legacy path"
    assert len(fake_db.added) == 1
    listing = fake_db.added[0]
    assert listing.zip_code == "10012"


def test_pin_path_empty_pickup_location_uses_place_label(create_listing_client, monkeypatch):
    """6. Pin path + empty pickup_location → stored pickup_location == reverse place label."""
    import services.mapbox as mapbox_mod

    monkeypatch.setattr(
        mapbox_mod, "reverse_geocode_zip",
        lambda lat, lng, tok: (_SEEDED_ZIP, _PLACE_LABEL),
    )

    client, fake_db = create_listing_client
    resp = client.post(
        "/api/listings",
        files=_make_post_form(
            latitude="40.725",
            longitude="-73.998",
            map_radius_mi="0.15",
            pickup_location="",  # empty — should fall back to place label
        ),
    )
    assert resp.status_code == 201, resp.text

    listing = fake_db.added[0]
    assert listing.pickup_location == _PLACE_LABEL, (
        f"expected place label fallback, got {listing.pickup_location!r}"
    )


# ---------------------------------------------------------------------------
# Task 4: get_listing_map renders per-listing map_radius_mi
# ---------------------------------------------------------------------------

import time as _time


def _make_map_listing(listing_id: str, map_radius_mi=None):
    from models import Listing
    return Listing(
        id=listing_id,
        user_id=_TEST_SELLER_UUID,
        price_cents=2000,
        posted_at=_time.time(),
        latitude=40.725,
        longitude=-73.998,
        zip_code=_SEEDED_ZIP,
        map_radius_mi=map_radius_mi,
    )


def _mock_db_for_map_listing(listing):
    """Minimal mock DB session for map.png endpoint tests."""
    class _Q:
        def __init__(self, model):
            self._model = model

        def filter(self, *conds):
            self._id = None
            for c in conds:
                try:
                    v = c.right.value
                    if isinstance(v, str):
                        self._id = v
                        break
                except AttributeError:
                    pass
            return self

        def first(self):
            if self._id == listing.id:
                return listing
            return None

    class _S:
        def query(self, model):
            return _Q(model)

        def get(self, model, key):
            return None

    return _S()


def test_map_png_renders_per_listing_radius(monkeypatch):
    """GET /api/listings/{id}/map.png uses listing.map_radius_mi when set."""
    import main
    from database import get_db
    from fastapi.testclient import TestClient
    import services.mapbox as mapbox_mod

    listing = _make_map_listing("mapradiustest01", map_radius_mi=0.3)
    mock_db = _mock_db_for_map_listing(listing)

    captured = {}

    def _fake_fetch(lat, lng, radius_mi, token):
        captured["radius_mi"] = radius_mi
        return b"\x89PNG\r\n\x1a\n"  # minimal PNG-ish bytes

    monkeypatch.setattr(main, "_MAPBOX_TOKEN", "tok")
    monkeypatch.setattr(mapbox_mod, "fetch_static_map_png", _fake_fetch)
    main.app.dependency_overrides[get_db] = lambda: mock_db

    try:
        r = TestClient(main.app).get(f"/api/listings/{listing.id}/map.png")
        assert r.status_code == 200
        assert captured["radius_mi"] == 0.3, f"expected 0.3, got {captured['radius_mi']}"
    finally:
        main.app.dependency_overrides.pop(get_db, None)


def test_map_png_null_radius_uses_default(monkeypatch):
    """GET /api/listings/{id}/map.png falls back to MAP_CIRCLE_RADIUS_MI when map_radius_mi is None."""
    import main
    from database import get_db
    from fastapi.testclient import TestClient
    import services.mapbox as mapbox_mod

    listing = _make_map_listing("mapradiustest02", map_radius_mi=None)
    mock_db = _mock_db_for_map_listing(listing)

    captured = {}

    def _fake_fetch(lat, lng, radius_mi, token):
        captured["radius_mi"] = radius_mi
        return b"\x89PNG\r\n\x1a\n"

    monkeypatch.setattr(main, "_MAPBOX_TOKEN", "tok")
    monkeypatch.setattr(mapbox_mod, "fetch_static_map_png", _fake_fetch)
    main.app.dependency_overrides[get_db] = lambda: mock_db

    try:
        r = TestClient(main.app).get(f"/api/listings/{listing.id}/map.png")
        assert r.status_code == 200
        assert captured["radius_mi"] == mapbox_mod.MAP_CIRCLE_RADIUS_MI, (
            f"expected {mapbox_mod.MAP_CIRCLE_RADIUS_MI}, got {captured['radius_mi']}"
        )
    finally:
        main.app.dependency_overrides.pop(get_db, None)


# ── Privacy-mask circle offset (user request 2026-06-11) ──────────────────────

def test_offset_circle_center_deterministic():
    """Same listing id must always produce the same circle center (a per-render
    random offset could be averaged across requests to recover the true point)."""
    a = mb.offset_circle_center("listing-1", 40.725, -73.998, 0.15)
    b = mb.offset_circle_center("listing-1", 40.725, -73.998, 0.15)
    assert a == b


def test_offset_circle_center_keeps_true_point_inside():
    """Offset distance must be 25-50% of the radius: off-center, but the true
    point always stays well inside the circle."""
    import math as m
    lat, lng = 40.725, -73.998
    radius = 0.15
    for lid in ["a", "b", "wl-161261670", "3429698f4de4"]:
        c_lat, c_lng = mb.offset_circle_center(lid, lat, lng, radius)
        d_mi = m.sqrt(((c_lat - lat) * 69.0) ** 2 + ((c_lng - lng) * 52.6) ** 2)
        assert 0.25 * radius - 1e-9 <= d_mi <= 0.50 * radius + 1e-9


def test_offset_circle_center_varies_by_listing():
    a = mb.offset_circle_center("listing-x", 40.725, -73.998, 0.15)
    b = mb.offset_circle_center("listing-y", 40.725, -73.998, 0.15)
    assert a != b


def test_map_png_server_cache_hits_on_second_request(monkeypatch):
    """The rendered PNG is cached server-side per (listing_id, radius): the
    second request must be served from cache without re-calling Mapbox."""
    import main
    calls = {"n": 0}

    def fake_fetch(lat, lng, radius_mi, token):
        calls["n"] += 1
        return b"png-bytes"

    monkeypatch.setattr(main, "_MAPBOX_TOKEN", "tok")
    listing = _make_listing(latitude=40.725, longitude=-73.998, map_radius_mi=0.2)
    with _client_for(listing, monkeypatch) as client:
        import services.mapbox as smb
        monkeypatch.setattr(smb, "fetch_static_map_png", fake_fetch)
        r1 = client.get(f"/api/listings/{listing.id}/map.png")
        r2 = client.get(f"/api/listings/{listing.id}/map.png")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r2.content == b"png-bytes"
    assert calls["n"] == 1

def test_map_png_server_cache_hits_on_second_request(monkeypatch):
    """The rendered PNG is cached server-side per (listing_id, radius): the
    second request must be served from cache without re-calling Mapbox."""
    import main
    from database import get_db
    from fastapi.testclient import TestClient
    import services.mapbox as mapbox_mod

    listing = _make_map_listing("mapcachetest001", map_radius_mi=0.2)
    mock_db = _mock_db_for_map_listing(listing)

    calls = {"n": 0}

    def _fake_fetch(lat, lng, radius_mi, token):
        calls["n"] += 1
        return b"\x89PNG-cache-test"

    monkeypatch.setattr(main, "_MAPBOX_TOKEN", "tok")
    monkeypatch.setattr(mapbox_mod, "fetch_static_map_png", _fake_fetch)
    main.app.dependency_overrides[get_db] = lambda: mock_db

    try:
        client = TestClient(main.app)
        r1 = client.get(f"/api/listings/{listing.id}/map.png")
        r2 = client.get(f"/api/listings/{listing.id}/map.png")
        assert r1.status_code == 200 and r2.status_code == 200
        assert r2.content == b"\x89PNG-cache-test"
        assert calls["n"] == 1, f"expected 1 Mapbox call, got {calls['n']}"
    finally:
        main.app.dependency_overrides.pop(get_db, None)
