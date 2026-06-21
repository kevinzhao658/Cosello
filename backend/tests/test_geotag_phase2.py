"""Phase-2 geotag tests — Mapbox map endpoint + walk_minutes field.

All Mapbox network calls are MOCKED (monkeypatched) — no real HTTP is made.
DB access is also mocked by patching the FastAPI ``get_db`` dependency, so
these tests run without a live Supabase connection and without any FK
constraints.

Coverage:
  - GET /api/listings/{id}/map.png  — 204 without token; 204 with null coords;
                                      200 image/png with mocked PNG; 404 missing.
  - Map response body/headers never contain the token or raw coordinates.
  - GET /api/listings/{id}          — walk_minutes null without token/buyer;
                                      walk_minutes int with mocked Directions;
                                      walk_minutes null when buyer has no ZIP;
                                      cache prevents a second Mapbox call.
  - GET /api/listings (feed)        — does NOT trigger a Directions call.
"""
from __future__ import annotations

import time
from typing import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Minimal 1×1 transparent PNG bytes (valid image for any response assertion)
# ---------------------------------------------------------------------------
_FAKE_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
    b"\xff?\x03\x00\x06\xfc\x02\xfe\xa7V\xbd\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
)

_LISTING_ID = "maptest000001"
_LISTING_ID_NO_COORDS = "maptest000002"
_LISTING_MISSING = "does-not-exist-xyz"

_TEST_LAT = 40.735
_TEST_LNG = -74.006
_TEST_ZIP = "10014"
_TEST_BUYER_LAT = 40.720
_TEST_BUYER_LNG = -74.010

# System seller UUID — matches SYSTEM_USER_ID so it's guaranteed to exist
_TEST_SELLER_UUID = "00000000-0000-0000-0000-000000000001"


# ---------------------------------------------------------------------------
# Minimal Listing factory (no DB, just the ORM object in memory)
# ---------------------------------------------------------------------------

def _make_listing(listing_id: str, lat=None, lng=None, zip_code=None):
    from models import Listing
    return Listing(
        id=listing_id,
        user_id=_TEST_SELLER_UUID,
        price_cents=2000,
        posted_at=time.time(),
        latitude=lat,
        longitude=lng,
        zip_code=zip_code,
    )


# ---------------------------------------------------------------------------
# Mock DB session factory
# ---------------------------------------------------------------------------

def _mock_db_for_listing(listing_id_to_obj: dict):
    """Return a mock SQLAlchemy session whose query().filter().first() resolves
    to objects from ``listing_id_to_obj`` keyed by listing id.

    Requests for unknown ids return None (simulating a 404 path).
    This lets us test the endpoint logic without any real DB connection or FK.
    """

    from models import Listing as _Listing

    class _MockQuery:
        def __init__(self, model):
            self._model = model
            self._filter_id = None

        def filter(self, *conditions):
            # Extract the id value from filter conditions if possible.
            # FastAPI / SQLAlchemy generates conditions like Listing.id == value.
            # We inspect the right-hand clause value.
            for cond in conditions:
                try:
                    # SQLAlchemy BinaryExpression: cond.right.value
                    val = cond.right.value
                    if isinstance(val, str):
                        self._filter_id = val
                        break
                except AttributeError:
                    pass
            return self

        def first(self):
            if self._model is _Listing:
                if self._filter_id is None:
                    return None
                return listing_id_to_obj.get(self._filter_id)
            return None

        # Support chained .filter().all() for Listing-only feed calls;
        # return [] for other models (CommunityMember, Friendship, User, etc.)
        # so circles enrichment short-circuits cleanly.
        def all(self):
            if self._model is _Listing:
                return list(listing_id_to_obj.values())
            return []

        # Support .order_by() / .outerjoin() chaining
        def order_by(self, *args):
            return self

        def outerjoin(self, *args, **kwargs):
            return self

        def join(self, *args, **kwargs):
            return self

    class _MockSession:
        def query(self, *models):
            # Accept single model or column expressions (e.g. CommunityMember.community_id)
            primary = models[0] if models else None
            if hasattr(primary, "class_"):
                primary = primary.class_
            return _MockQuery(primary)

        def get(self, model, key):
            return None  # ZipCentroid lookups handled by monkeypatch on centroid_for_zip

    return _MockSession()


# ---------------------------------------------------------------------------
# Reset walk cache between tests
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_walk_cache():
    import main
    main._walk_cache.clear()
    main._map_png_cache.clear()
    yield
    main._walk_cache.clear()
    main._map_png_cache.clear()


# ---------------------------------------------------------------------------
# map.png endpoint tests
# ---------------------------------------------------------------------------

class TestMapPng:
    @pytest.fixture
    def client_with_listing(self, monkeypatch):
        """TestClient with a mocked DB that has both test listings."""
        import main
        from database import get_db

        listing_with = _make_listing(_LISTING_ID, lat=_TEST_LAT, lng=_TEST_LNG, zip_code=_TEST_ZIP)
        listing_no_coords = _make_listing(_LISTING_ID_NO_COORDS, lat=None, lng=None)
        mock_db = _mock_db_for_listing({
            _LISTING_ID: listing_with,
            _LISTING_ID_NO_COORDS: listing_no_coords,
        })

        main.app.dependency_overrides[get_db] = lambda: mock_db
        yield TestClient(main.app)
        main.app.dependency_overrides.pop(get_db, None)

    def test_204_when_token_unset(self, client_with_listing, monkeypatch):
        """Without MAPBOX_TOKEN the endpoint must return 204, never 500."""
        import main
        monkeypatch.setattr(main, "_MAPBOX_TOKEN", None)
        r = client_with_listing.get(f"/api/listings/{_LISTING_ID}/map.png")
        assert r.status_code == 204

    def test_204_when_listing_coords_null(self, client_with_listing, monkeypatch):
        """Listing with null lat/lng → 204 even if token is set."""
        import main
        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        r = client_with_listing.get(f"/api/listings/{_LISTING_ID_NO_COORDS}/map.png")
        assert r.status_code == 204

    def test_404_for_missing_listing(self, monkeypatch):
        """Non-existent listing_id → 404."""
        import main
        from database import get_db

        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        # DB returns nothing for any id
        mock_db = _mock_db_for_listing({})
        main.app.dependency_overrides[get_db] = lambda: mock_db
        try:
            r = TestClient(main.app).get(f"/api/listings/{_LISTING_MISSING}/map.png")
            assert r.status_code == 404
        finally:
            main.app.dependency_overrides.pop(get_db, None)

    def test_200_png_with_token_and_coords(self, client_with_listing, monkeypatch):
        """Token set + coords present → 200 image/png with mocked bytes."""
        import main
        import services.mapbox as mapbox_mod
        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        monkeypatch.setattr(mapbox_mod, "fetch_static_map_png", lambda *a, **kw: _FAKE_PNG)

        r = client_with_listing.get(f"/api/listings/{_LISTING_ID}/map.png")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
        assert r.content == _FAKE_PNG
        assert "max-age=86400" in r.headers.get("cache-control", "")

    def test_503_when_mapbox_returns_none(self, client_with_listing, monkeypatch):
        """If fetch_static_map_png returns None (Mapbox error) → 503."""
        import main
        import services.mapbox as mapbox_mod
        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        monkeypatch.setattr(mapbox_mod, "fetch_static_map_png", lambda *a, **kw: None)

        r = client_with_listing.get(f"/api/listings/{_LISTING_ID}/map.png")
        assert r.status_code == 503

    def test_response_never_contains_token(self, client_with_listing, monkeypatch):
        """The response body and headers must not contain the token string."""
        import main
        import services.mapbox as mapbox_mod
        fake_token = "pk.test-secret-token-abc"
        monkeypatch.setattr(main, "_MAPBOX_TOKEN", fake_token)
        monkeypatch.setattr(mapbox_mod, "fetch_static_map_png", lambda *a, **kw: _FAKE_PNG)

        r = client_with_listing.get(f"/api/listings/{_LISTING_ID}/map.png")
        assert r.status_code == 200
        assert fake_token not in r.text
        header_values = " ".join(str(v) for v in r.headers.values())
        assert fake_token not in header_values

    def test_response_never_contains_raw_coords(self, client_with_listing, monkeypatch):
        """The response body must not contain the exact lat/lng strings."""
        import main
        import services.mapbox as mapbox_mod
        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        monkeypatch.setattr(mapbox_mod, "fetch_static_map_png", lambda *a, **kw: _FAKE_PNG)

        r = client_with_listing.get(f"/api/listings/{_LISTING_ID}/map.png")
        assert r.status_code == 200
        body_str = r.content.decode("latin-1", errors="ignore")
        assert str(_TEST_LAT) not in body_str
        assert str(_TEST_LNG) not in body_str


# ---------------------------------------------------------------------------
# walk_minutes on GET /api/listings/{id}
# ---------------------------------------------------------------------------

class TestWalkMinutes:
    @pytest.fixture
    def mock_user_with_zip(self):
        from models import User
        return User(
            id="00000000-0000-0000-0000-000000000002",
            display_name="Map Buyer",
            zip_code=_TEST_ZIP,
        )

    @pytest.fixture
    def mock_user_no_zip(self):
        from models import User
        return User(
            id="00000000-0000-0000-0000-000000000003",
            display_name="No-ZIP Buyer",
            zip_code=None,
        )

    @pytest.fixture
    def client_with_mocked_db(self, monkeypatch):
        """TestClient with mocked DB + ZipCentroid lookup."""
        import main
        from database import get_db
        from auth import get_optional_user
        from services import geo

        listing_with = _make_listing(_LISTING_ID, lat=_TEST_LAT, lng=_TEST_LNG, zip_code=_TEST_ZIP)
        listing_no_coords = _make_listing(_LISTING_ID_NO_COORDS)
        mock_db = _mock_db_for_listing({
            _LISTING_ID: listing_with,
            _LISTING_ID_NO_COORDS: listing_no_coords,
        })

        # Monkeypatch centroid_for_zip so we don't need a real ZipCentroid table
        monkeypatch.setattr(geo, "centroid_for_zip",
                            lambda db, zip_code: (_TEST_BUYER_LAT, _TEST_BUYER_LNG) if zip_code == _TEST_ZIP else None)

        main.app.dependency_overrides[get_db] = lambda: mock_db
        yield
        main.app.dependency_overrides.pop(get_db, None)
        main.app.dependency_overrides.pop(get_optional_user, None)

    def test_null_without_token(self, client_with_mocked_db, mock_user_with_zip, monkeypatch):
        """walk_minutes is null when MAPBOX_TOKEN is not set."""
        import main
        from auth import get_optional_user

        monkeypatch.setattr(main, "_MAPBOX_TOKEN", None)
        main.app.dependency_overrides[get_optional_user] = lambda: mock_user_with_zip

        r = TestClient(main.app).get(f"/api/listings/{_LISTING_ID}")
        assert r.status_code == 200
        assert r.json()["walk_minutes"] is None

    def test_null_when_buyer_has_no_zip(self, client_with_mocked_db, mock_user_no_zip, monkeypatch):
        """walk_minutes is null when the buyer has no ZIP code."""
        import main
        from auth import get_optional_user

        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        main.app.dependency_overrides[get_optional_user] = lambda: mock_user_no_zip

        r = TestClient(main.app).get(f"/api/listings/{_LISTING_ID}")
        assert r.status_code == 200
        assert r.json()["walk_minutes"] is None

    def test_null_when_unauthenticated(self, client_with_mocked_db, monkeypatch):
        """walk_minutes is null when no user is authenticated."""
        import main
        from auth import get_optional_user

        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        main.app.dependency_overrides[get_optional_user] = lambda: None

        r = TestClient(main.app).get(f"/api/listings/{_LISTING_ID}")
        assert r.status_code == 200
        assert r.json()["walk_minutes"] is None

    def test_walk_minutes_populated_with_mocked_directions(
        self, client_with_mocked_db, mock_user_with_zip, monkeypatch
    ):
        """walk_minutes is an int when token + buyer ZIP + mocked Directions return duration."""
        import main
        import services.mapbox as mapbox_mod
        from auth import get_optional_user

        call_count = {"n": 0}

        def _fake_walking_minutes(o_lat, o_lng, d_lat, d_lng, token):
            call_count["n"] += 1
            return 7

        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        monkeypatch.setattr(mapbox_mod, "walking_minutes", _fake_walking_minutes)
        main.app.dependency_overrides[get_optional_user] = lambda: mock_user_with_zip

        r = TestClient(main.app).get(f"/api/listings/{_LISTING_ID}")
        assert r.status_code == 200
        body = r.json()
        assert body["walk_minutes"] == 7
        assert isinstance(body["walk_minutes"], int)

    def test_walk_cache_prevents_second_mapbox_call(
        self, client_with_mocked_db, mock_user_with_zip, monkeypatch
    ):
        """A second request for the same (buyer_zip, listing_id) hits the cache."""
        import main
        import services.mapbox as mapbox_mod
        from auth import get_optional_user

        call_count = {"n": 0}

        def _fake_walking_minutes(*a, **kw):
            call_count["n"] += 1
            return 5

        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        monkeypatch.setattr(mapbox_mod, "walking_minutes", _fake_walking_minutes)
        main.app.dependency_overrides[get_optional_user] = lambda: mock_user_with_zip

        client = TestClient(main.app)
        r1 = client.get(f"/api/listings/{_LISTING_ID}")
        r2 = client.get(f"/api/listings/{_LISTING_ID}")

        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["walk_minutes"] == 5
        assert r2.json()["walk_minutes"] == 5
        assert call_count["n"] == 1, (
            f"Mapbox Directions called {call_count['n']} times — cache should prevent the second call"
        )

    def test_null_when_listing_coords_null(
        self, client_with_mocked_db, mock_user_with_zip, monkeypatch
    ):
        """walk_minutes is null when the listing has no coordinates (no Directions call)."""
        import main
        import services.mapbox as mapbox_mod
        from auth import get_optional_user

        call_count = {"n": 0}

        def _fake_walking_minutes(*a, **kw):
            call_count["n"] += 1
            return 3

        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        monkeypatch.setattr(mapbox_mod, "walking_minutes", _fake_walking_minutes)
        main.app.dependency_overrides[get_optional_user] = lambda: mock_user_with_zip

        r = TestClient(main.app).get(f"/api/listings/{_LISTING_ID_NO_COORDS}")
        assert r.status_code == 200
        assert r.json()["walk_minutes"] is None
        assert call_count["n"] == 0

    def test_404_for_missing_listing(self, monkeypatch):
        """GET /api/listings/{id} returns 404 for a non-existent listing."""
        import main
        from database import get_db

        mock_db = _mock_db_for_listing({})
        main.app.dependency_overrides[get_db] = lambda: mock_db
        try:
            r = TestClient(main.app).get(f"/api/listings/{_LISTING_MISSING}")
            assert r.status_code == 404
        finally:
            main.app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Feed endpoint does NOT call Directions
# ---------------------------------------------------------------------------

class TestFeedDoesNotCallDirections:
    def test_directions_never_called_in_feed(self, monkeypatch):
        """GET /api/listings (feed) must NOT trigger the Mapbox Directions API.

        walk_minutes is a detail-only field — not present in feed items.
        """
        import main
        import services.mapbox as mapbox_mod
        from auth import get_current_user
        from database import get_db
        from models import User

        call_count = {"n": 0}

        def _fake_walking_minutes(*a, **kw):
            call_count["n"] += 1
            return 4

        monkeypatch.setattr(main, "_MAPBOX_TOKEN", "pk.fake-token")
        monkeypatch.setattr(mapbox_mod, "walking_minutes", _fake_walking_minutes)

        # Feed endpoint reads from the real DB via get_db but we inject a mock
        # that returns an empty listing set so there is nothing to compute anyway.
        # The assertion is that calling the feed endpoint NEVER calls walking_minutes.
        from models import Listing as _Listing, ZipCentroid as _ZipCentroid, Community, CommunityMember

        class _EmptyFeedSession:
            """Minimal mock for the feed's DB usage."""
            def query(self, model):
                return self

            def filter(self, *a, **kw):
                return self

            def all(self):
                return []

            def first(self):
                return None

            def get(self, model, key):
                return None

        buyer = User(
            id="00000000-0000-0000-0000-000000000002",
            display_name="Buyer",
            zip_code=_TEST_ZIP,
            neighborhood=None,
        )
        main.app.dependency_overrides[get_current_user] = lambda: buyer
        main.app.dependency_overrides[get_db] = lambda: _EmptyFeedSession()

        try:
            r = TestClient(main.app).get("/api/listings")
            assert r.status_code == 200
            items = r.json() if isinstance(r.json(), list) else []
            for item in items:
                assert "walk_minutes" not in item, (
                    "walk_minutes must not appear in feed endpoint response"
                )
            assert call_count["n"] == 0, (
                f"Mapbox Directions was called {call_count['n']} time(s) from the feed endpoint — must be 0"
            )
        finally:
            main.app.dependency_overrides.pop(get_current_user, None)
            main.app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Mapbox service unit tests (pure functions, no HTTP)
# ---------------------------------------------------------------------------

class TestMapboxService:
    def test_build_static_map_url_shape(self):
        """build_static_map_url returns a URL with expected components."""
        from services.mapbox import build_static_map_url
        url = build_static_map_url(40.735, -74.006, 0.4, "pk.test-token")
        assert "pk.test-token" in url
        assert "geojson" in url
        assert "640x400" in url
        assert "mapbox.com" in url

    def test_walking_minutes_rounds_up(self, monkeypatch):
        """walking_minutes rounds duration up to whole minutes (ceil)."""
        import httpx
        from services.mapbox import walking_minutes

        class _FakeResp:
            status_code = 200

            def json(self):
                return {"routes": [{"duration": 361.0}]}  # 6 min 1 sec → ceil = 7

        monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResp())
        result = walking_minutes(40.72, -74.01, 40.735, -74.006, "pk.fake")
        assert result == 7

    def test_walking_minutes_exact_multiple(self, monkeypatch):
        """walking_minutes on an exact minute boundary stays the same."""
        import httpx
        from services.mapbox import walking_minutes

        class _FakeResp:
            status_code = 200

            def json(self):
                return {"routes": [{"duration": 600.0}]}  # exactly 10 min

        monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResp())
        result = walking_minutes(40.72, -74.01, 40.735, -74.006, "pk.fake")
        assert result == 10

    def test_walking_minutes_returns_none_on_http_error(self, monkeypatch):
        """walking_minutes returns None when Mapbox returns non-200."""
        import httpx
        from services.mapbox import walking_minutes

        class _FakeResp:
            status_code = 500

            def json(self):
                return {}

        monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResp())
        result = walking_minutes(40.72, -74.01, 40.735, -74.006, "pk.fake")
        assert result is None

    def test_walking_minutes_returns_none_on_exception(self, monkeypatch):
        """walking_minutes returns None when network raises."""
        import httpx
        from services.mapbox import walking_minutes

        def _raise(*a, **kw):
            raise httpx.TimeoutException("timeout")

        monkeypatch.setattr(httpx, "get", _raise)
        result = walking_minutes(40.72, -74.01, 40.735, -74.006, "pk.fake")
        assert result is None

    def test_walking_minutes_returns_none_on_empty_routes(self, monkeypatch):
        """walking_minutes returns None when Mapbox returns no routes."""
        import httpx
        from services.mapbox import walking_minutes

        class _FakeResp:
            status_code = 200

            def json(self):
                return {"routes": []}

        monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResp())
        result = walking_minutes(40.72, -74.01, 40.735, -74.006, "pk.fake")
        assert result is None

    def test_fetch_static_map_png_returns_none_on_error(self, monkeypatch):
        """fetch_static_map_png returns None on non-200."""
        import httpx
        from services.mapbox import fetch_static_map_png

        class _FakeResp:
            status_code = 403
            content = b""

        monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResp())
        result = fetch_static_map_png(40.735, -74.006, 0.4, "pk.fake")
        assert result is None

    def test_fetch_static_map_png_returns_bytes_on_200(self, monkeypatch):
        """fetch_static_map_png returns bytes on 200."""
        import httpx
        from services.mapbox import fetch_static_map_png

        class _FakeResp:
            status_code = 200
            content = _FAKE_PNG

        monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResp())
        result = fetch_static_map_png(40.735, -74.006, 0.4, "pk.fake")
        assert result == _FAKE_PNG

    def test_fetch_static_map_png_returns_none_on_exception(self, monkeypatch):
        """fetch_static_map_png returns None when network raises."""
        import httpx
        from services.mapbox import fetch_static_map_png

        def _raise(*a, **kw):
            raise httpx.TimeoutException("timeout")

        monkeypatch.setattr(httpx, "get", _raise)
        result = fetch_static_map_png(40.735, -74.006, 0.4, "pk.fake")
        assert result is None
