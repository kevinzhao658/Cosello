"""Tests for listing-creation behaviour under the circles model (Phase 2).

Phase 2 retires the seller-picks `communities` form field on create-listing.
The field is now silently ignored if sent (backward-compatible with old clients),
and new listings always store communities=NULL. The seller's circles derive from
their own memberships, not from per-listing tags.

Removed tests (intentionally):
  - test_public_listing_honors_exact_seller_picks: asserted communities=[id] after
    posting with a communities value. Under circles the field is ignored, so the
    stored value is always NULL. Replaced by test_communities_field_ignored_on_create.
  - test_more_than_three_communities_rejected: asserted 400 for >3 community IDs.
    The 3-cap no longer exists. Replaced by test_more_than_three_communities_ignored.
  - test_non_member_community_rejected: asserted 400 when posting a community the
    user isn't a member of. The membership check no longer exists. Replaced by
    test_non_member_community_ignored.
  - test_legacy_neighborhood_string_silently_dropped: asserted communities==[] for
    a legacy "neighborhood" string. Updated to assert communities is NULL/empty.
  - test_public_listing_zero_communities_allowed: asserted communities==[] for an
    empty communities string. Updated to assert communities is NULL/empty.
"""
import json
from sqlalchemy import text

from constants.neighborhoods import NYC_NEIGHBORHOODS
from services.neighborhood import set_user_neighborhood, get_neighborhood_community


def _img_bytes() -> bytes:
    # 1x1 transparent PNG — smallest valid image bytes for the listing pipeline.
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
        b"\xff?\x03\x00\x06\xfc\x02\xfe\xa7V\xbd\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def _make_listing_form(*, communities: str = "", visibility: str = "public",
                       pickup: str = "Lower East Side, NYC",
                       pickup_zip: str = "10014") -> dict:
    return {
        "data": (None, json.dumps({
            "brand": "TestBrand", "name": "TestItem",
            "description": "Test description.", "priceCents": 1000,
            "condition": "Good", "tags": [],
            "category": "other", "categoryAttributes": {},
        })),
        "communities": (None, communities),
        "visibility": (None, visibility),
        "pickup_location": (None, pickup),
        "pickup_zip": (None, pickup_zip),
        "images": ("test.png", _img_bytes(), "image/png"),
    }


def _communities_value(db_session, listing_id: str):
    """Return the raw communities column value for a listing (may be None or str)."""
    row = db_session.execute(
        text("SELECT communities FROM listings WHERE id = :id"),
        {"id": listing_id},
    ).first()
    return row[0] if row else None


def _is_empty_communities(val) -> bool:
    """True when communities is NULL, empty string, or '[]'."""
    if val is None or val == "":
        return True
    try:
        return json.loads(val) == []
    except (TypeError, ValueError):
        return False


# ---------------------------------------------------------------------------
# New circles-model tests: communities field is silently ignored
# ---------------------------------------------------------------------------

def test_communities_field_ignored_on_create(authed_client, test_user, db_session, mock_storage):
    """Sending a valid community ID is silently ignored. communities stored as NULL."""
    test_user.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()
    chelsea = get_neighborhood_community(db_session, "Chelsea")

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities=str(chelsea.id), visibility="public"),
    )
    assert resp.status_code == 201, resp.text
    listing_id = resp.json()["id"]
    assert _is_empty_communities(_communities_value(db_session, listing_id))


def test_more_than_three_communities_ignored(authed_client, test_user, db_session, mock_storage):
    """Sending 4 community IDs no longer triggers a 400 — field is ignored, listing posts cleanly."""
    test_user.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()

    names = ["Chelsea", "SoHo", "Tribeca", "Chinatown"]
    ids: list[int] = []
    for nm in names:
        c = get_neighborhood_community(db_session, nm)
        from models import CommunityMember
        if not db_session.query(CommunityMember).filter_by(user_id=test_user.id, community_id=c.id).first():
            db_session.add(CommunityMember(user_id=test_user.id, community_id=c.id, role="member"))
        ids.append(c.id)
    db_session.commit()

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities=",".join(str(i) for i in ids), visibility="public"),
    )
    assert resp.status_code == 201, resp.text
    assert _is_empty_communities(_communities_value(db_session, resp.json()["id"]))


def test_non_member_community_ignored(authed_client, test_user, db_session, mock_storage):
    """Sending a community the user isn't a member of is silently ignored (no 400)."""
    test_user.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()
    soho = get_neighborhood_community(db_session, "SoHo")

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities=str(soho.id), visibility="public"),
    )
    assert resp.status_code == 201, resp.text
    assert _is_empty_communities(_communities_value(db_session, resp.json()["id"]))


def test_legacy_neighborhood_string_silently_dropped(authed_client, test_user, db_session, mock_storage):
    """An old client sending 'neighborhood' as a value gets no community attached
    (no error, no crash). Listing posts cleanly with empty/null communities."""
    test_user.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities="neighborhood", visibility="public"),
    )
    assert resp.status_code == 201
    assert _is_empty_communities(_communities_value(db_session, resp.json()["id"]))


def test_public_listing_zero_communities_allowed(authed_client, test_user, db_session, mock_storage):
    """Empty communities string results in a clean public listing with null communities."""
    test_user.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities="", visibility="public"),
    )
    assert resp.status_code == 201
    assert _is_empty_communities(_communities_value(db_session, resp.json()["id"]))
