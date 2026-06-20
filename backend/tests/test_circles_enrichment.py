import sys
import time
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, Listing
from services.circles import set_user_building, set_circle_consent
from services.neighborhood import get_neighborhood_community


def test_feed_listing_exposes_circles_for_mutual_viewer(
    db_session, make_user, client, override_auth_user
):
    """Feed circles key is 'neighborhood' (not 'building') per spec rev 2026-06-19.
    Seller and viewer share the Chelsea neighborhood circle with consent on."""
    seller = make_user(display_name="Seller", neighborhood="Chelsea")
    viewer = make_user(display_name="Viewer", neighborhood="Chelsea")
    # Both users are already members of the Chelsea neighborhood community via
    # make_user(neighborhood="Chelsea"). Consent defaults to False — set it on.
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
    mine = next(l for l in resp.json() if l["id"] == listing.id)
    assert mine["circles"]["neighborhood"]["shared"] is True
    assert mine["circles"]["school"]["shared"] is False
    assert mine["circles"]["mutualFriends"]["count"] == 0

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
    seller = make_user(display_name="MineSeller", neighborhood="Chelsea")
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
    assert mine["circles"]["neighborhood"]["shared"] is True
    assert mine["circles"]["school"]["shared"] is False
    assert mine["circles"]["mutualFriends"]["count"] == 0
    assert "directFriend" in mine["circles"]["mutualFriends"]

    # cleanup listing + seller's neighborhood membership
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == nbr.id,
        CommunityMember.user_id == seller.id,
    ).delete(synchronize_session=False)
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
