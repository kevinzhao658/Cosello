import sys
import time
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, Listing
from services.circles import set_user_building, set_circle_consent


def test_feed_listing_exposes_circles_for_mutual_viewer(
    db_session, make_user, client, override_auth_user
):
    seller = make_user(display_name="Seller", neighborhood="Chelsea")
    viewer = make_user(display_name="Viewer", neighborhood="Chelsea")
    b = set_user_building(db_session, seller, "12 Jane St")
    set_user_building(db_session, viewer, "12 Jane St")
    set_circle_consent(db_session, seller.id, b.id, True)
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
    assert mine["circles"]["building"]["shared"] is True
    assert mine["circles"]["school"]["shared"] is False
    assert mine["circles"]["mutualFriends"]["count"] == 0

    # cleanup
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.query(CommunityMember).filter(CommunityMember.community_id == b.id).delete()
    db_session.query(Community).filter(Community.id == b.id).delete()
    db_session.commit()


def test_created_listing_has_no_communities(db_session, make_user, client, override_auth_user, mock_storage):
    seller = make_user(display_name="Creator", neighborhood="SoHo")
    override_auth_user(seller)
    resp = client.post("/api/listings", data={
        "title": "Mug", "description": "ceramic", "price": "8",
        "category": "home", "brand": "Unknown", "name": "Mug",
        "communities": "1,2,3",   # legacy field — must be ignored
    })
    assert resp.status_code in (200, 201)
    from models import Listing
    row = db_session.query(Listing).filter(Listing.user_id == seller.id, Listing.title == "Mug").first()
    assert row is not None
    assert (row.communities or "[]") in ("[]", None, "")
    db_session.query(Listing).filter(Listing.id == row.id).delete()
    db_session.commit()
