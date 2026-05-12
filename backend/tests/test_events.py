"""Tests for behavioral event capture endpoints (FYP instrumentation).

Covers:
  - 204 happy path for /api/events/view, /api/events/search, /api/interactions
  - 401 when no auth header is supplied
  - 422 on malformed payloads
  - Idempotency on /api/interactions: duplicate (user, listing, action) updates
    `ts` rather than inserting a new row.
"""
from __future__ import annotations

import json
import time

import pytest

import main
from models import (
    Listing,
    ListingInteraction,
    ListingView,
    SearchQuery,
)


pytestmark = pytest.mark.skip(
    reason=(
        "Skipped pending test-infra fix: public.users.id FK to auth.users.id "
        "prevents direct user seeding. Fix tracked in docs/COMMERCIAL_PR_CHECKLIST.md "
        "(integration test infra item)."
    )
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


@pytest.fixture
def test_listing(db_session, test_user):
    """A real listing row so FK constraints are satisfied if enforced."""
    listing_id = f"evt-{int(time.time() * 1000) % 1_000_000_000}"
    listing = Listing(
        id=listing_id,
        user_id=test_user.id,
        brand="TestBrand",
        name="Test Item",
        price_cents=1000,
        posted_at=time.time(),
    )
    db_session.add(listing)
    db_session.commit()
    yield listing
    # Clean up rows that depend on this listing first, then the listing itself,
    # so the shared `test_user` teardown can drop the user without FK violations.
    db_session.query(ListingView).filter(
        ListingView.listing_id == listing_id
    ).delete()
    db_session.query(SearchQuery).filter(
        SearchQuery.user_id == test_user.id
    ).delete()
    db_session.query(ListingInteraction).filter(
        ListingInteraction.listing_id == listing_id
    ).delete()
    db_session.query(Listing).filter(Listing.id == listing_id).delete()
    db_session.commit()


@pytest.fixture
def auth_headers(test_user, override_auth_user):
    """Install the FastAPI auth override and return an empty header dict so
    the existing `headers=auth_headers` call sites remain a no-op syntactically."""
    override_auth_user(test_user)
    return {}


# --------------------------------------------------------------------------- #
# /api/events/view                                                            #
# --------------------------------------------------------------------------- #


def test_view_event_happy_path(client, auth_headers, test_listing, test_user, db_session):
    payload = {"listing_id": test_listing.id, "source": "feed", "dwell_ms": 4200}
    resp = client.post("/api/events/view", json=payload, headers=auth_headers)
    assert resp.status_code == 204, resp.text

    rows = db_session.query(ListingView).filter(
        ListingView.user_id == test_user.id,
        ListingView.listing_id == test_listing.id,
    ).all()
    assert len(rows) == 1
    assert rows[0].source == "feed"
    assert rows[0].dwell_ms == 4200
    assert rows[0].ts > 0


def test_view_event_unauthenticated_returns_401(client, test_listing):
    payload = {"listing_id": test_listing.id, "source": "feed", "dwell_ms": 0}
    resp = client.post("/api/events/view", json=payload)
    assert resp.status_code == 401


def test_view_event_malformed_payload_returns_422(client, auth_headers):
    # Missing required `source` and `dwell_ms`
    resp = client.post(
        "/api/events/view", json={"listing_id": "abc"}, headers=auth_headers
    )
    assert resp.status_code == 422


def test_view_event_negative_dwell_returns_422(client, auth_headers, test_listing):
    payload = {"listing_id": test_listing.id, "source": "feed", "dwell_ms": -10}
    resp = client.post("/api/events/view", json=payload, headers=auth_headers)
    assert resp.status_code == 422


def test_view_event_multiple_inserts_each_recorded(
    client, auth_headers, test_listing, test_user, db_session
):
    """Views are NOT idempotent — each call creates a new row."""
    for _ in range(3):
        resp = client.post(
            "/api/events/view",
            json={"listing_id": test_listing.id, "source": "search", "dwell_ms": 100},
            headers=auth_headers,
        )
        assert resp.status_code == 204

    rows = db_session.query(ListingView).filter(
        ListingView.user_id == test_user.id,
        ListingView.listing_id == test_listing.id,
    ).all()
    assert len(rows) == 3


# --------------------------------------------------------------------------- #
# /api/events/search                                                          #
# --------------------------------------------------------------------------- #


def test_search_event_happy_path_with_filters(
    client, auth_headers, test_user, db_session
):
    payload = {
        "query": "vintage denim jacket",
        "filters": {"category": "clothing", "max_price": 100},
    }
    resp = client.post("/api/events/search", json=payload, headers=auth_headers)
    assert resp.status_code == 204, resp.text

    rows = db_session.query(SearchQuery).filter(
        SearchQuery.user_id == test_user.id,
        SearchQuery.query_text == "vintage denim jacket",
    ).all()
    assert len(rows) == 1
    assert rows[0].filters_json is not None
    assert json.loads(rows[0].filters_json) == {
        "category": "clothing",
        "max_price": 100,
    }


def test_search_event_filters_optional(client, auth_headers, test_user, db_session):
    resp = client.post(
        "/api/events/search",
        json={"query": "no filters here"},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    rows = db_session.query(SearchQuery).filter(
        SearchQuery.user_id == test_user.id,
        SearchQuery.query_text == "no filters here",
    ).all()
    assert len(rows) == 1
    assert rows[0].filters_json is None


def test_search_event_unauthenticated_returns_401(client):
    resp = client.post("/api/events/search", json={"query": "anything"})
    assert resp.status_code == 401


def test_search_event_malformed_payload_returns_422(client, auth_headers):
    # Missing required `query`
    resp = client.post(
        "/api/events/search", json={"filters": {}}, headers=auth_headers
    )
    assert resp.status_code == 422


# --------------------------------------------------------------------------- #
# /api/interactions                                                           #
# --------------------------------------------------------------------------- #


def test_interaction_happy_path(
    client, auth_headers, test_listing, test_user, db_session
):
    resp = client.post(
        "/api/interactions",
        json={"listing_id": test_listing.id, "action": "hide"},
        headers=auth_headers,
    )
    assert resp.status_code == 204, resp.text

    rows = db_session.query(ListingInteraction).filter(
        ListingInteraction.user_id == test_user.id,
        ListingInteraction.listing_id == test_listing.id,
    ).all()
    assert len(rows) == 1
    assert rows[0].action == "hide"


def test_interaction_unauthenticated_returns_401(client, test_listing):
    resp = client.post(
        "/api/interactions",
        json={"listing_id": test_listing.id, "action": "hide"},
    )
    assert resp.status_code == 401


def test_interaction_malformed_payload_returns_422(client, auth_headers):
    # Missing required `action`
    resp = client.post(
        "/api/interactions", json={"listing_id": "abc"}, headers=auth_headers
    )
    assert resp.status_code == 422


def test_interaction_idempotent_on_duplicate(
    client, auth_headers, test_listing, test_user, db_session
):
    """Duplicate (user, listing, action) updates `ts`, does not insert."""
    # First insert
    resp = client.post(
        "/api/interactions",
        json={"listing_id": test_listing.id, "action": "not_interested"},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    rows = db_session.query(ListingInteraction).filter(
        ListingInteraction.user_id == test_user.id,
        ListingInteraction.listing_id == test_listing.id,
        ListingInteraction.action == "not_interested",
    ).all()
    assert len(rows) == 1
    first_ts = rows[0].ts

    # Force a measurable delta then re-post the same triple
    time.sleep(0.01)
    resp = client.post(
        "/api/interactions",
        json={"listing_id": test_listing.id, "action": "not_interested"},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    db_session.expire_all()
    rows = db_session.query(ListingInteraction).filter(
        ListingInteraction.user_id == test_user.id,
        ListingInteraction.listing_id == test_listing.id,
        ListingInteraction.action == "not_interested",
    ).all()
    assert len(rows) == 1, "duplicate post must not create a second row"
    assert rows[0].ts > first_ts, "duplicate post must bump ts"


def test_interaction_distinct_actions_create_distinct_rows(
    client, auth_headers, test_listing, test_user, db_session
):
    """Same listing, different actions -> separate rows."""
    for action in ("hide", "block_seller", "not_interested"):
        resp = client.post(
            "/api/interactions",
            json={"listing_id": test_listing.id, "action": action},
            headers=auth_headers,
        )
        assert resp.status_code == 204

    rows = db_session.query(ListingInteraction).filter(
        ListingInteraction.user_id == test_user.id,
        ListingInteraction.listing_id == test_listing.id,
    ).all()
    assert len(rows) == 3
    assert {r.action for r in rows} == {"hide", "block_seller", "not_interested"}
