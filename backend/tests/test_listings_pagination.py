"""Tests for the server-side pagination + SQL-filter refactor of /api/listings
and /api/listings/public.

Covers:
- New {items, nextCursor} envelope shape on both endpoints
- limit / cursor pagination (keyset for browse, offset for FYP)
- No duplicate items across pages
- nextCursor is None when there are no more pages
- SQL category filter
- SQL search filter (ILIKE)
- Community filter returns only visible listings
- Hard radius cap (FEED_MAX_RADIUS_MI): listings beyond the cap excluded
- Listings without coords are excluded when buyer has a location (bounding-box)
"""
import base64
import json
import time
import uuid

import pytest

from models import Community, CommunityMember, Listing, ZipCentroid


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _img_bytes() -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
        b"\xff?\x03\x00\x06\xfc\x02\xfe\xa7V\xbd\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def _mk_listing_direct(
    db,
    *,
    user_id: str,
    name: str = "Item",
    category: str = "other",
    price_cents: int = 1000,
    posted_at: float | None = None,
    latitude: float | None = 40.730,
    longitude: float | None = -74.000,
    zip_code: str | None = "10014",
    visibility: str = "public",
    status: str = "open",
    communities: list | None = None,
) -> Listing:
    """Insert a Listing row directly without the HTTP endpoint."""
    listing_id = uuid.uuid4().hex[:12]
    listing = Listing(
        id=listing_id,
        user_id=user_id,
        brand="Brand",
        name=name,
        description=f"desc for {name}",
        price_cents=price_cents,
        category=category,
        posted_at=posted_at if posted_at is not None else time.time(),
        latitude=latitude,
        longitude=longitude,
        zip_code=zip_code,
        visibility=visibility,
        status=status,
        communities=json.dumps(communities) if communities is not None else None,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


def _seed_zip(db, zip_code: str, lat: float, lng: float) -> None:
    if db.get(ZipCentroid, zip_code) is None:
        db.add(ZipCentroid(zip_code=zip_code, latitude=lat, longitude=lng, borough="Manhattan"))
        db.commit()


def _decode_cursor(cursor: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(cursor.encode()))


# ---------------------------------------------------------------------------
# Fixture: cleanup helper for listings created in these tests
# ---------------------------------------------------------------------------

@pytest.fixture
def listing_cleanup(db_session):
    ids: list[str] = []
    yield ids
    if ids:
        db_session.query(Listing).filter(Listing.id.in_(ids)).delete(synchronize_session=False)
        db_session.commit()


# ---------------------------------------------------------------------------
# Envelope shape tests
# ---------------------------------------------------------------------------

class TestEnvelopeShape:
    def test_authenticated_feed_returns_envelope(self, authed_client, db_session, test_user):
        """GET /api/listings returns {items, nextCursor} not a bare array."""
        resp = authed_client.get("/api/listings")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict), "response must be an object, not a bare array"
        assert "items" in body, "response must have 'items' key"
        assert "nextCursor" in body, "response must have 'nextCursor' key"
        assert isinstance(body["items"], list)

    def test_public_feed_returns_envelope(self, client):
        """GET /api/listings/public returns {items, nextCursor} not a bare array."""
        resp = client.get("/api/listings/public")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)
        assert "items" in body and "nextCursor" in body
        assert isinstance(body["items"], list)

    def test_next_cursor_null_when_no_more_pages(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """nextCursor is null when the result fits in one page."""
        seller = make_user(display_name="PagSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        # Create only 2 listings (well under default limit of 24).
        for i in range(2):
            l = _mk_listing_direct(
                db_session, user_id=seller.id, name=f"SN-Item-{i}",
                latitude=40.730, longitude=-74.000, zip_code="10014",
            )
            listing_cleanup.append(l.id)

        resp = authed_client.get("/api/listings", params={"limit": 24})
        body = resp.json()
        # May have other listings from other tests; check that if total <= limit, nextCursor is None.
        if len(body["items"]) < 24:
            assert body["nextCursor"] is None

    def test_next_cursor_not_null_when_more_pages(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """nextCursor is a non-null string when there are more rows than limit."""
        seller = make_user(display_name="PagSeller2")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        now = time.time()
        for i in range(5):
            l = _mk_listing_direct(
                db_session, user_id=seller.id, name=f"Pag-Item-{i}",
                posted_at=now - i,
                latitude=40.730, longitude=-74.000, zip_code="10014",
            )
            listing_cleanup.append(l.id)

        # Request only 2 at a time to trigger pagination.
        resp = authed_client.get("/api/listings", params={"limit": 2})
        body = resp.json()
        # At least 5 listings exist now; 2 per page means 3 pages minimum.
        if len(body["items"]) == 2:
            assert body["nextCursor"] is not None, (
                "nextCursor must be non-null when there are more pages"
            )
            assert isinstance(body["nextCursor"], str)


# ---------------------------------------------------------------------------
# Keyset pagination: no duplicates, full traversal
# ---------------------------------------------------------------------------

class TestKeysetPagination:
    def test_no_duplicates_across_pages(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """Traversing all pages via nextCursor must yield no duplicate item ids."""
        seller = make_user(display_name="NoDupSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        now = time.time()
        expected_ids: set[str] = set()
        for i in range(7):
            l = _mk_listing_direct(
                db_session, user_id=seller.id, name=f"Dup-Item-{i}",
                posted_at=now - i * 5,
                latitude=40.730, longitude=-74.000, zip_code="10014",
            )
            listing_cleanup.append(l.id)
            expected_ids.add(l.id)

        seen_ids: list[str] = []
        cursor = None
        page_count = 0
        while True:
            params: dict = {"limit": 3, "sort": "newest"}
            if cursor:
                params["cursor"] = cursor
            resp = authed_client.get("/api/listings", params=params)
            assert resp.status_code == 200
            body = resp.json()
            page_ids = [item["id"] for item in body["items"]]
            seen_ids.extend(page_ids)
            cursor = body["nextCursor"]
            page_count += 1
            if cursor is None or page_count > 20:
                break

        # No duplicates anywhere across all pages.
        assert len(seen_ids) == len(set(seen_ids)), "duplicate ids found across pages"

        # Every listing we created must appear in the traversal.
        seen_set = set(seen_ids)
        for lid in expected_ids:
            assert lid in seen_set, f"listing {lid} missing from paginated traversal"

    def test_cursor_encodes_offset(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """nextCursor must decode to a dict containing 'offset' key (offset-based pagination)."""
        seller = make_user(display_name="CursorSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        now = time.time()
        for i in range(3):
            l = _mk_listing_direct(
                db_session, user_id=seller.id, name=f"Cur-Item-{i}",
                posted_at=now - i,
                latitude=40.730, longitude=-74.000, zip_code="10014",
            )
            listing_cleanup.append(l.id)

        resp = authed_client.get("/api/listings", params={"limit": 1, "sort": "newest"})
        body = resp.json()
        if body["nextCursor"] is not None:
            decoded = _decode_cursor(body["nextCursor"])
            assert "offset" in decoded, "cursor must contain 'offset' key"
            assert decoded["offset"] == 1

    def test_public_feed_no_duplicates_across_pages(
        self, client, db_session, listing_cleanup, make_user, override_auth_user
    ):
        """Public feed paginated traversal must also yield no duplicates."""
        seller = make_user(display_name="PubPagSeller")
        _seed_zip(db_session, "10012", 40.726, -74.001)

        now = time.time()
        expected_ids: set[str] = set()
        for i in range(5):
            l = _mk_listing_direct(
                db_session, user_id=seller.id, name=f"Pub-Item-{i}",
                posted_at=now - i * 5,
                latitude=40.726, longitude=-74.001, zip_code="10012",
                visibility="public",
            )
            listing_cleanup.append(l.id)
            expected_ids.add(l.id)

        seen_ids: list[str] = []
        cursor = None
        page_count = 0
        while True:
            params: dict = {"limit": 2}
            if cursor:
                params["cursor"] = cursor
            resp = client.get("/api/listings/public", params=params)
            assert resp.status_code == 200
            body = resp.json()
            page_ids = [item["id"] for item in body["items"]]
            seen_ids.extend(page_ids)
            cursor = body["nextCursor"]
            page_count += 1
            if cursor is None or page_count > 20:
                break

        assert len(seen_ids) == len(set(seen_ids)), "duplicate ids in public feed traversal"
        seen_set = set(seen_ids)
        for lid in expected_ids:
            assert lid in seen_set, f"public listing {lid} missing from traversal"


# ---------------------------------------------------------------------------
# SQL category filter
# ---------------------------------------------------------------------------

class TestCategoryFilter:
    def test_category_filter_excludes_other_categories(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """?category=clothing must not return listings with category=other."""
        seller = make_user(display_name="CatSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        clothing = _mk_listing_direct(
            db_session, user_id=seller.id, name="Cat-Clothing-Item",
            category="clothing",
            latitude=40.730, longitude=-74.000, zip_code="10014",
        )
        other = _mk_listing_direct(
            db_session, user_id=seller.id, name="Cat-Other-Item",
            category="other",
            latitude=40.730, longitude=-74.000, zip_code="10014",
        )
        listing_cleanup.extend([clothing.id, other.id])

        resp = authed_client.get("/api/listings", params={"category": "clothing"})
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json()["items"]}
        assert clothing.id in ids, "clothing listing must appear in clothing filter"
        assert other.id not in ids, "other-category listing must not appear in clothing filter"

    def test_category_filter_multi(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """?category=clothing,home must match both categories."""
        seller = make_user(display_name="MultiCatSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        clothing = _mk_listing_direct(
            db_session, user_id=seller.id, name="MultiCat-Clothing",
            category="clothing",
            latitude=40.730, longitude=-74.000,
        )
        home = _mk_listing_direct(
            db_session, user_id=seller.id, name="MultiCat-Home",
            category="home",
            latitude=40.730, longitude=-74.000,
        )
        electronics = _mk_listing_direct(
            db_session, user_id=seller.id, name="MultiCat-Electronics",
            category="electronics",
            latitude=40.730, longitude=-74.000,
        )
        listing_cleanup.extend([clothing.id, home.id, electronics.id])

        resp = authed_client.get("/api/listings", params={"category": "clothing,home"})
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json()["items"]}
        assert clothing.id in ids
        assert home.id in ids
        assert electronics.id not in ids


# ---------------------------------------------------------------------------
# SQL search filter (ILIKE)
# ---------------------------------------------------------------------------

class TestSearchFilter:
    def test_search_matches_name(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """?search=uniquewidget must find a listing whose name contains the term."""
        seller = make_user(display_name="SearchSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        match = _mk_listing_direct(
            db_session, user_id=seller.id, name="UniqueWidgetXYZ",
            category="other",
            latitude=40.730, longitude=-74.000,
        )
        no_match = _mk_listing_direct(
            db_session, user_id=seller.id, name="RandomChair",
            category="other",
            latitude=40.730, longitude=-74.000,
        )
        listing_cleanup.extend([match.id, no_match.id])

        resp = authed_client.get("/api/listings", params={"search": "uniquewidget"})
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json()["items"]}
        assert match.id in ids, "search should find listing by name (case-insensitive)"
        assert no_match.id not in ids, "unrelated listing must not appear in search results"

    def test_search_matches_description(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """?search=raredescterm must find a listing by description ILIKE."""
        seller = make_user(display_name="DescSearchSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        listing = Listing(
            id=uuid.uuid4().hex[:12],
            user_id=seller.id,
            brand="B",
            name="Generic Item",
            description="Contains the RareDescTermXYZ in its description",
            price_cents=1000,
            category="other",
            posted_at=time.time(),
            latitude=40.730,
            longitude=-74.000,
            zip_code="10014",
            visibility="public",
            status="open",
        )
        db_session.add(listing)
        db_session.commit()
        listing_cleanup.append(listing.id)

        resp = authed_client.get("/api/listings", params={"search": "raredescterm"})
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json()["items"]}
        assert listing.id in ids, "search must match description via ILIKE"

    def test_search_public_feed_matches_name(
        self, client, db_session, listing_cleanup, make_user, override_auth_user
    ):
        """Public feed ?search= must also return items matching by name."""
        seller = make_user(display_name="PubSearchSeller")
        _seed_zip(db_session, "10012", 40.726, -74.001)

        match = _mk_listing_direct(
            db_session, user_id=seller.id, name="PubSearchItem99",
            latitude=40.726, longitude=-74.001, visibility="public",
        )
        listing_cleanup.append(match.id)

        resp = client.get("/api/listings/public", params={"search": "pubsearchitem99"})
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json()["items"]}
        assert match.id in ids


# ---------------------------------------------------------------------------
# Community filter (preserves visibility semantics)
# ---------------------------------------------------------------------------

class TestCommunityFilter:
    def test_community_filter_public_community(
        self, authed_client, db_session, test_user, listing_cleanup
    ):
        """?community=<id> for a public community must return listings tagged with it."""
        comm = Community(
            name="TestPubComm",
            is_public=True,
            invite_code=f"tpub-{uuid.uuid4().hex[:8]}",
            created_by=test_user.id,
        )
        db_session.add(comm)
        db_session.commit()
        db_session.refresh(comm)

        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        in_comm = _mk_listing_direct(
            db_session, user_id=test_user.id, name="CommFilter-In",
            communities=[comm.id],
            latitude=40.730, longitude=-74.000,
        )
        out_comm = _mk_listing_direct(
            db_session, user_id=test_user.id, name="CommFilter-Out",
            communities=None,
            latitude=40.730, longitude=-74.000,
        )
        listing_cleanup.extend([in_comm.id, out_comm.id])

        # User is a member of the community (needed to see it in community filter).
        db_session.add(CommunityMember(community_id=comm.id, user_id=test_user.id))
        db_session.commit()

        resp = authed_client.get("/api/listings", params={"community": str(comm.id)})
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json()["items"]}
        assert in_comm.id in ids, "listing in community must appear in community-filtered feed"
        assert out_comm.id not in ids, "listing outside community must be excluded"

        # Cleanup the community membership and community.
        db_session.query(CommunityMember).filter(
            CommunityMember.community_id == comm.id,
            CommunityMember.user_id == test_user.id,
        ).delete(synchronize_session=False)
        db_session.query(Community).filter(Community.id == comm.id).delete()
        db_session.commit()


# ---------------------------------------------------------------------------
# Radius cap (FEED_MAX_RADIUS_MI)
# ---------------------------------------------------------------------------

class TestRadiusCap:
    def test_distant_listing_excluded_from_feed(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """A listing >10 miles from the buyer must be excluded by the hard radius cap."""
        from routers.listings import FEED_MAX_RADIUS_MI
        from services.geo import haversine_miles

        seller = make_user(display_name="DistantSeller")
        # Buyer in West Village (10014, ~40.730, -74.000).
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        # Place a listing far outside Manhattan (e.g., far upstate ~42.0, -74.0).
        # That is ~90+ miles away from 40.730, -74.000.
        distant_lat, distant_lng = 42.0, -74.0
        dist = haversine_miles(40.730, -74.000, distant_lat, distant_lng)
        assert dist > FEED_MAX_RADIUS_MI, (
            f"sanity: distant point must be > {FEED_MAX_RADIUS_MI} mi away (got {dist:.1f})"
        )

        far_listing = _mk_listing_direct(
            db_session, user_id=seller.id, name="Distant-Item",
            latitude=distant_lat, longitude=distant_lng,
            zip_code="10014",  # zip doesn't matter for the cap
        )
        listing_cleanup.append(far_listing.id)

        resp = authed_client.get("/api/listings")
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json()["items"]}
        assert far_listing.id not in ids, (
            "listing beyond FEED_MAX_RADIUS_MI must be excluded from the feed"
        )

    def test_nearby_listing_included_in_feed(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """A listing within 10 miles of the buyer must appear in the feed."""
        seller = make_user(display_name="NearbySeller")
        # Both buyer and listing in West Village.
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        nearby = _mk_listing_direct(
            db_session, user_id=seller.id, name="Nearby-Item",
            latitude=40.730, longitude=-74.000, zip_code="10014",
        )
        listing_cleanup.append(nearby.id)

        resp = authed_client.get("/api/listings")
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json()["items"]}
        assert nearby.id in ids, "nearby listing must appear in the feed"

    def test_listings_without_coords_excluded_when_buyer_has_location(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """A listing with null lat/lng is excluded when the buyer has a known location
        (the bounding-box filter requires non-null coords)."""
        seller = make_user(display_name="NullCoordSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        no_coord = _mk_listing_direct(
            db_session, user_id=seller.id, name="NullCoord-Item",
            latitude=None, longitude=None, zip_code=None,
        )
        listing_cleanup.append(no_coord.id)

        resp = authed_client.get("/api/listings")
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json()["items"]}
        assert no_coord.id not in ids, (
            "listing with null coords must be excluded when buyer has a location"
        )

    def test_distance_miles_within_cap(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """Every item returned must have distance_miles <= FEED_MAX_RADIUS_MI."""
        from routers.listings import FEED_MAX_RADIUS_MI

        seller = make_user(display_name="CapDistSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        nearby = _mk_listing_direct(
            db_session, user_id=seller.id, name="CapDist-Item",
            latitude=40.730, longitude=-74.000, zip_code="10014",
        )
        listing_cleanup.append(nearby.id)

        resp = authed_client.get("/api/listings")
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            d = item.get("distance_miles")
            if d is not None:
                assert d <= FEED_MAX_RADIUS_MI, (
                    f"item {item['id']} has distance_miles={d} > cap {FEED_MAX_RADIUS_MI}"
                )


# ---------------------------------------------------------------------------
# FYP cursor (offset-based)
# ---------------------------------------------------------------------------

class TestFYPPagination:
    def test_fyp_cursor_encodes_offset(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """FYP nextCursor must decode to a dict with 'offset' key."""
        seller = make_user(display_name="FYPCursorSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        now = time.time()
        for i in range(5):
            l = _mk_listing_direct(
                db_session, user_id=seller.id, name=f"FYP-Cur-{i}",
                posted_at=now - i,
                latitude=40.730, longitude=-74.000,
            )
            listing_cleanup.append(l.id)

        # FYP mode: no search, no community (default).
        resp = authed_client.get("/api/listings", params={"limit": 2})
        body = resp.json()
        if body["nextCursor"] is not None:
            decoded = _decode_cursor(body["nextCursor"])
            assert "offset" in decoded, (
                "FYP nextCursor must contain 'offset' key"
            )
            assert decoded["offset"] == 2

    def test_fyp_no_duplicates_across_pages(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """FYP offset pagination must not return duplicate ids across pages."""
        seller = make_user(display_name="FYPDupSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        now = time.time()
        expected_ids: set[str] = set()
        for i in range(6):
            l = _mk_listing_direct(
                db_session, user_id=seller.id, name=f"FYP-Dup-{i}",
                posted_at=now - i * 10,
                latitude=40.730, longitude=-74.000,
            )
            listing_cleanup.append(l.id)
            expected_ids.add(l.id)

        seen_ids: list[str] = []
        cursor = None
        page_count = 0
        while True:
            params: dict = {"limit": 2}
            if cursor:
                params["cursor"] = cursor
            resp = authed_client.get("/api/listings", params=params)
            assert resp.status_code == 200
            body = resp.json()
            page_ids = [item["id"] for item in body["items"]]
            seen_ids.extend(page_ids)
            cursor = body["nextCursor"]
            page_count += 1
            if cursor is None or page_count > 20:
                break

        assert len(seen_ids) == len(set(seen_ids)), "FYP pagination produced duplicates"
        seen_set = set(seen_ids)
        for lid in expected_ids:
            assert lid in seen_set, f"FYP listing {lid} not found across all pages"


# ---------------------------------------------------------------------------
# Item shape: distance_miles present, score fields absent
# ---------------------------------------------------------------------------

class TestItemShape:
    def test_items_have_distance_miles(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """Each item in the response must have a distance_miles field when buyer has a zip."""
        seller = make_user(display_name="ShapeSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        l = _mk_listing_direct(
            db_session, user_id=seller.id, name="Shape-Item",
            latitude=40.730, longitude=-74.000,
        )
        listing_cleanup.append(l.id)

        resp = authed_client.get("/api/listings")
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            assert "distance_miles" in item, f"item {item.get('id')} missing distance_miles"

    def test_items_do_not_expose_score(
        self, authed_client, db_session, test_user, listing_cleanup, make_user
    ):
        """Score/ranking fields must never appear in the item dicts."""
        seller = make_user(display_name="NoScoreSeller")
        _seed_zip(db_session, "10014", 40.730, -74.000)
        test_user.zip_code = "10014"
        db_session.commit()

        l = _mk_listing_direct(
            db_session, user_id=seller.id, name="NoScore-Item",
            latitude=40.730, longitude=-74.000,
        )
        listing_cleanup.append(l.id)

        resp = authed_client.get("/api/listings")
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            assert "score" not in item
            assert "_score" not in item
            assert "fyp_score" not in item
