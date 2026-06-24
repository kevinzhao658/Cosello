import sys
import time
import uuid
import secrets
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, Listing, SchoolSeed
from services.circles import set_user_building, set_circle_consent, add_user_school
from services.neighborhood import get_neighborhood_community


def test_feed_listing_exposes_circles_for_mutual_viewer(
    db_session, make_user, client, override_auth_user
):
    """Feed circles key is 'neighborhood' (not 'building') per spec rev 2026-06-19.
    Seller and viewer share the Chelsea neighborhood circle with consent on."""
    from services.neighborhood import set_user_neighborhood as _set_nbr
    seller = make_user(display_name="Seller", neighborhood="Chelsea")
    viewer = make_user(display_name="Viewer", neighborhood="Chelsea")
    # make_user sets user.neighborhood via raw SQL but doesn't create a
    # CommunityMember row. Clear the cached neighborhood string first so
    # set_user_neighborhood doesn't short-circuit on old==new, then
    # enroll both users properly.
    seller.neighborhood = None
    viewer.neighborhood = None
    db_session.commit()
    _set_nbr(db_session, seller, "Chelsea")
    _set_nbr(db_session, viewer, "Chelsea")
    nbr = get_neighborhood_community(db_session, "Chelsea")
    assert nbr is not None, "Chelsea neighborhood community must be seeded"
    set_circle_consent(db_session, seller.id, nbr.id, True)
    listing = Listing(
        id=uuid.uuid4().hex[:12],
        user_id=seller.id, description="nice", price_cents=2000,
        category="home", brand="Unknown", name="Lamp",
        posted_at=time.time(),
    )
    db_session.add(listing); db_session.commit(); db_session.refresh(listing)

    override_auth_user(viewer)
    resp = client.get("/api/listings")
    assert resp.status_code == 200
    # New envelope: {items: [...], nextCursor: ...}
    payload = resp.json()
    assert "items" in payload and "nextCursor" in payload
    mine = next(l for l in payload["items"] if l["id"] == listing.id)
    # New circles shape: {connection:{degree}, school}
    # Neighborhood is no longer in the circles shape (spec rev 2026-06-20)
    assert "neighborhood" not in mine["circles"]
    assert set(mine["circles"].keys()) == {"connection", "school"}
    assert mine["circles"]["connection"]["degree"] is None  # not friends
    assert mine["circles"]["school"] is None  # seller has no school

    # cleanup listing and memberships for seller/viewer (not the system-owned Community)
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == nbr.id,
        CommunityMember.user_id.in_([seller.id, viewer.id]),
    ).delete(synchronize_session=False)
    db_session.commit()


def _img_bytes() -> bytes:
    # 1x1 transparent PNG — smallest valid image bytes.
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
        b"\xff?\x03\x00\x06\xfc\x02\xfe\xa7V\xbd\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def test_mine_listing_exposes_circles_for_seller(
    db_session, make_user, client, override_auth_user
):
    """GET /api/listings/mine enriches each listing with a circles object whose
    consented neighborhood circle is shared=True (spec rev 2026-06-19)."""
    from services.neighborhood import set_user_neighborhood as _set_nbr
    seller = make_user(display_name="MineSeller", neighborhood="Chelsea")
    # make_user sets user.neighborhood via raw SQL but doesn't create a
    # CommunityMember row. Clear neighborhood first so set_user_neighborhood
    # doesn't short-circuit on old==new, then enroll explicitly.
    seller.neighborhood = None
    db_session.commit()
    _set_nbr(db_session, seller, "Chelsea")
    nbr = get_neighborhood_community(db_session, "Chelsea")
    assert nbr is not None, "Chelsea neighborhood community must be seeded"
    set_circle_consent(db_session, seller.id, nbr.id, True)
    listing = Listing(
        id=uuid.uuid4().hex[:12],
        user_id=seller.id, description="shelf", price_cents=3000,
        category="home", brand="IKEA", name="Billy",
        posted_at=time.time(),
    )
    db_session.add(listing); db_session.commit(); db_session.refresh(listing)

    override_auth_user(seller)
    resp = client.get("/api/listings/mine")
    assert resp.status_code == 200
    mine = next((l for l in resp.json() if l["id"] == listing.id), None)
    assert mine is not None, "listing not found in /api/listings/mine response"
    assert "circles" in mine, "/api/listings/mine listing missing 'circles' key"
    # New circles shape: {connection:{degree}, school} (spec rev 2026-06-20)
    assert set(mine["circles"].keys()) == {"connection", "school"}
    assert "neighborhood" not in mine["circles"]
    assert mine["circles"]["connection"]["degree"] is None  # viewer == seller
    assert mine["circles"]["school"] is None  # seller has no school

    # cleanup listing + seller's neighborhood membership
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == nbr.id,
        CommunityMember.user_id == seller.id,
    ).delete(synchronize_session=False)
    db_session.commit()


def test_public_feed_circles_use_new_shape(db_session, make_user, client, mock_storage, override_auth_user):
    """GET /api/listings/public must return circles with the new {connection, school}
    shape (spec rev 2026-06-20). No 'neighborhood' or 'building' keys."""
    import json as _json
    seller = make_user(display_name="PubSeller", neighborhood="SoHo")
    override_auth_user(seller)
    # Create a listing so we have something in the public feed.
    resp = client.post("/api/listings", files={
        "data": (None, _json.dumps({
            "brand": "Unknown", "name": "PubTestLamp",
            "description": "ceramic", "priceCents": 1500,
            "condition": "Good", "tags": [],
            "category": "other", "categoryAttributes": {},
        })),
        "communities": (None, ""),
        "visibility": (None, "public"),
        "pickup_location": (None, "SoHo, NYC"),
        "pickup_zip": (None, "10012"),
        "images": ("test.png", _img_bytes(), "image/png"),
    })
    assert resp.status_code in (200, 201)

    # Fetch the public (unauthenticated) feed.
    pub_resp = client.get("/api/listings/public")
    assert pub_resp.status_code == 200
    # New envelope: {items: [...], nextCursor: ...}
    pub_payload = pub_resp.json()
    assert "items" in pub_payload and "nextCursor" in pub_payload
    items = pub_payload["items"]
    # Find our listing (may not exist if in-memory store was cleared, but at
    # minimum the endpoint must return 200 and every item must use "neighborhood").
    for item in items:
        circles = item.get("circles", {})
        # New shape: {connection:{degree}, school} — no neighborhood, no building,
        # no mutualFriends keys (spec rev 2026-06-20).
        assert set(circles.keys()) == {"connection", "school"}, (
            f"listing {item.get('id')!r} unexpected circles keys: {set(circles.keys())}"
        )
        assert "neighborhood" not in circles, (
            f"listing {item.get('id')!r} circles dict still has legacy 'neighborhood' key"
        )
        assert "building" not in circles, (
            f"listing {item.get('id')!r} circles dict still has legacy 'building' key"
        )
        assert "degree" in circles["connection"]

    # cleanup
    from models import Listing as _Listing
    db_session.query(_Listing).filter(
        _Listing.user_id == seller.id, _Listing.name == "PubTestLamp"
    ).delete()
    db_session.commit()


def _make_school_seed(db_session, name: str) -> SchoolSeed:
    seed = SchoolSeed(name=name, state="NY")
    db_session.add(seed)
    db_session.commit()
    db_session.refresh(seed)
    return seed


def test_public_feed_shows_school_for_seller_with_school(
    db_session, make_user, client, mock_storage, override_auth_user
):
    """BUG-1 regression: signed-out public feed must return a non-null school for
    a seller who has a visible school (spec §9/§11: school is always-on, even
    without a viewer). Previously hardcoded to EMPTY_CIRCLES."""
    import json as _json
    seller = make_user(display_name="SchoolSeller", neighborhood="SoHo")
    seed = _make_school_seed(db_session, "Zzzqa Enrichment University")
    school_community = add_user_school(db_session, seller, seed.id)
    # add_user_school creates the membership; ensure share_with_mutuals=True
    m = db_session.query(CommunityMember).filter(
        CommunityMember.community_id == school_community.id,
        CommunityMember.user_id == seller.id,
    ).first()
    m.share_with_mutuals = True
    db_session.commit()

    override_auth_user(seller)
    resp = client.post("/api/listings", files={
        "data": (None, _json.dumps({
            "brand": "Unknown", "name": "SchoolLamp",
            "description": "bright", "priceCents": 1000,
            "condition": "Good", "tags": [],
            "category": "other", "categoryAttributes": {},
        })),
        "communities": (None, ""),
        "visibility": (None, "public"),
        "pickup_location": (None, "SoHo, NYC"),
        "pickup_zip": (None, "10012"),
        "images": ("test.png", _img_bytes(), "image/png"),
    })
    assert resp.status_code in (200, 201)

    # Fetch the PUBLIC (unauthenticated) feed.
    pub_resp = client.get("/api/listings/public")
    assert pub_resp.status_code == 200
    # New envelope: {items: [...], nextCursor: ...}
    pub_payload2 = pub_resp.json()
    assert "items" in pub_payload2 and "nextCursor" in pub_payload2
    items = pub_payload2["items"]
    seller_items = [i for i in items if i.get("userId") == seller.id]
    assert seller_items, "seller's listing not found in public feed"
    item = seller_items[0]
    circles = item["circles"]
    assert set(circles.keys()) == {"connection", "school"}
    assert circles["connection"]["degree"] is None  # no viewer
    assert circles["school"] is not None, (
        "school must be non-null for a seller with a visible school on the public feed"
    )
    assert circles["school"]["fullName"] == "Zzzqa Enrichment University"
    assert circles["school"]["isMine"] is False  # no viewer to compare against

    # cleanup
    db_session.query(Listing).filter(Listing.user_id == seller.id, Listing.name == "SchoolLamp").delete()
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == school_community.id,
        CommunityMember.user_id == seller.id,
    ).delete(synchronize_session=False)
    db_session.query(Community).filter(Community.id == school_community.id).delete()
    db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()


def test_listing_detail_has_circles_authed(db_session, make_user, client, override_auth_user):
    """Gap-2: GET /api/listings/{id} must include a circles field (authed case)."""
    seller = make_user(display_name="DetailSeller")
    viewer = make_user(display_name="DetailViewer")
    listing = Listing(
        id=uuid.uuid4().hex[:12],
        user_id=seller.id, description="detail test", price_cents=500,
        category="other", brand="Unknown", name="Widget",
        posted_at=time.time(),
    )
    db_session.add(listing); db_session.commit(); db_session.refresh(listing)

    override_auth_user(viewer)
    resp = client.get(f"/api/listings/{listing.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert "circles" in body, "detail endpoint missing 'circles' field"
    circles = body["circles"]
    assert set(circles.keys()) == {"connection", "school"}
    assert circles["connection"]["degree"] is None  # strangers
    assert circles["school"] is None  # seller has no school

    # cleanup
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.commit()


def test_listing_detail_has_circles_signed_out(db_session, make_user, client):
    """Gap-2: GET /api/listings/{id} signed-out must return school-only circles
    (degree None, isMine False). School is non-null when seller has one."""
    seller = make_user(display_name="DetailSignedOutSeller")
    seed = _make_school_seed(db_session, "Zzzqa Detail University")
    school_community = add_user_school(db_session, seller, seed.id)
    m = db_session.query(CommunityMember).filter(
        CommunityMember.community_id == school_community.id,
        CommunityMember.user_id == seller.id,
    ).first()
    m.share_with_mutuals = True
    db_session.commit()

    listing = Listing(
        id=uuid.uuid4().hex[:12],
        user_id=seller.id, description="signed-out detail", price_cents=800,
        category="other", brand="Unknown", name="Gadget",
        posted_at=time.time(),
    )
    db_session.add(listing); db_session.commit(); db_session.refresh(listing)

    # No auth override — signed-out request.
    resp = client.get(f"/api/listings/{listing.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert "circles" in body, "detail endpoint missing 'circles' field for signed-out user"
    circles = body["circles"]
    assert set(circles.keys()) == {"connection", "school"}
    assert circles["connection"]["degree"] is None  # no viewer
    assert circles["school"] is not None, "school must be non-null for signed-out detail view"
    assert circles["school"]["fullName"] == "Zzzqa Detail University"
    assert circles["school"]["isMine"] is False

    # cleanup
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == school_community.id,
        CommunityMember.user_id == seller.id,
    ).delete(synchronize_session=False)
    db_session.query(Community).filter(Community.id == school_community.id).delete()
    db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()


def test_created_listing_has_no_communities(db_session, make_user, client, override_auth_user, mock_storage):
    import json as _json
    seller = make_user(display_name="Creator", neighborhood="SoHo")
    override_auth_user(seller)
    resp = client.post("/api/listings", files={
        "data": (None, _json.dumps({
            "brand": "Unknown", "name": "Mug",
            "description": "ceramic", "priceCents": 800,
            "condition": "Good", "tags": [],
            "category": "other", "categoryAttributes": {},
        })),
        "communities": (None, "1,2,3"),   # legacy field — must be ignored
        "visibility": (None, "public"),
        "pickup_location": (None, "SoHo, NYC"),
        "pickup_zip": (None, "10012"),
        "images": ("test.png", _img_bytes(), "image/png"),
    })
    assert resp.status_code in (200, 201)
    from models import Listing
    row = db_session.query(Listing).filter(Listing.user_id == seller.id, Listing.name == "Mug").first()
    assert row is not None
    assert (row.communities or "[]") in ("[]", None, "")
    db_session.query(Listing).filter(Listing.id == row.id).delete()
    db_session.commit()
