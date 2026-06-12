"""Phase 2b — map pickup picker backend tests. All Mapbox HTTP is mocked."""
import io
import json
import pytest
import services.mapbox as mb


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
                "place_name": "123 Mercer St, New York, New York 10012, United States",
                "context": [{"id": "postcode.123", "text": "10012"}],
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
