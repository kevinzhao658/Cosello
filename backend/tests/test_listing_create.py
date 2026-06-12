"""Tests for listing-creation community validation after PR 3 cutover.

The PR 3 spec replaces the public-listing auto-attach with seller-picked
community IDs. These tests assert the new validation surface:
  - Public listings honor exactly what the seller submits (no override)
  - >3 communities rejected with 400
  - Non-member community ID rejected with 400
  - Non-int community values silently dropped (legacy "neighborhood" → no-op)
  - Private listings still require ≥1 private community + all member
"""
import io
import json
import pytest
from sqlalchemy import text

from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS
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


def test_public_listing_honors_exact_seller_picks(authed_client, test_user, db_session, mock_storage):
    """Public listing's communities array == seller-submitted IDs (no auto-attach)."""
    # Clear then re-set neighborhood to guarantee the CommunityMember row exists.
    # (conftest creates test_user with neighborhood="Chelsea" via raw SQL, which
    # bypasses set_user_neighborhood's membership creation step.)
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

    row = db_session.execute(
        text("SELECT communities FROM listings WHERE id = :id"),
        {"id": listing_id},
    ).first()
    assert json.loads(row[0]) == [chelsea.id]


def test_more_than_three_communities_rejected(authed_client, test_user, db_session, mock_storage):
    test_user.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()
    # Build 4 community IDs the user IS a member of (system neighborhood + 3 more).
    # Pick from MANHATTAN_NEIGHBORHOODS via get_neighborhood_community.
    names = ["Chelsea", "SoHo", "Tribeca", "Chinatown"]
    ids: list[int] = []
    for nm in names:
        c = get_neighborhood_community(db_session, nm)
        # Join them so the membership check passes — we want to isolate the cap-of-3 error.
        from models import CommunityMember
        if not db_session.query(CommunityMember).filter_by(user_id=test_user.id, community_id=c.id).first():
            db_session.add(CommunityMember(user_id=test_user.id, community_id=c.id, role="member"))
        ids.append(c.id)
    db_session.commit()

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities=",".join(str(i) for i in ids), visibility="public"),
    )
    assert resp.status_code == 400
    assert "At most 3 communities" in resp.json()["detail"]


def test_non_member_community_rejected(authed_client, test_user, db_session, mock_storage):
    """Even if community id is valid, user must be a member."""
    # User is in Chelsea (set after clearing so membership row is created).
    # SoHo exists but user is NOT a member.
    test_user.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()
    soho = get_neighborhood_community(db_session, "SoHo")

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities=str(soho.id), visibility="public"),
    )
    assert resp.status_code == 400
    assert "not a member" in resp.json()["detail"]


def test_legacy_neighborhood_string_silently_dropped(authed_client, test_user, db_session, mock_storage):
    """An old client sending 'neighborhood' as a value gets no community attached
    (no error, no crash). Listing posts cleanly with empty communities."""
    test_user.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities="neighborhood", visibility="public"),
    )
    assert resp.status_code == 201
    listing_id = resp.json()["id"]
    row = db_session.execute(
        text("SELECT communities FROM listings WHERE id = :id"),
        {"id": listing_id},
    ).first()
    assert json.loads(row[0]) == []


def test_public_listing_zero_communities_allowed(authed_client, test_user, db_session, mock_storage):
    test_user.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities="", visibility="public"),
    )
    assert resp.status_code == 201
    listing_id = resp.json()["id"]
    row = db_session.execute(
        text("SELECT communities FROM listings WHERE id = :id"),
        {"id": listing_id},
    ).first()
    assert json.loads(row[0]) == []
