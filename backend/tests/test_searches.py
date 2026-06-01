"""Tests for GET /api/searches/top — top-searches aggregation endpoint.

Covers:
  - Ranking by count descending
  - Normalization: lowercase + trim merges "Carhartt Jacket" / "carhartt jacket "
  - Blank-term exclusion (whitespace-only query_text rows are omitted)
  - Window filtering: rows older than window_days are excluded
  - 401 when no auth override is installed
  - Query param validation: window_days and limit boundaries
"""
from __future__ import annotations

import time

import pytest

import main
from auth import get_current_user
from models import SearchQuery


# --------------------------------------------------------------------------- #
# Fixtures                                                                     #
# --------------------------------------------------------------------------- #


@pytest.fixture
def auth_headers(test_user, override_auth_user):
    """Install the FastAPI auth override and return an empty header dict.

    Mirrors the identical fixture in test_events.py so call sites can use
    `headers=auth_headers` uniformly.
    """
    override_auth_user(test_user)
    return {}


# --------------------------------------------------------------------------- #
# Tests                                                                        #
# --------------------------------------------------------------------------- #


def test_top_searches_ranks_and_normalizes(client, db_session, test_user, auth_headers):
    """Ranking by count desc + normalization (case + trailing space collapse)."""
    now = time.time()

    # "Carhartt Jacket" x3 + "carhartt jacket " x1 → normalized to "carhartt jacket", count=4
    for _ in range(3):
        db_session.add(
            SearchQuery(user_id=test_user.id, query_text="Carhartt Jacket", ts=now - 100)
        )
    db_session.add(
        SearchQuery(user_id=test_user.id, query_text="carhartt jacket ", ts=now - 50)
    )
    # "doc martens" x1 — should appear, ranked below carhartt jacket
    db_session.add(
        SearchQuery(user_id=test_user.id, query_text="doc martens", ts=now - 50)
    )
    # Blank / whitespace-only — must be excluded
    db_session.add(
        SearchQuery(user_id=test_user.id, query_text="   ", ts=now - 50)
    )
    # Outside the 7-day window (90 days ago) — must be excluded
    db_session.add(
        SearchQuery(user_id=test_user.id, query_text="old item", ts=now - 90 * 86400)
    )
    db_session.commit()

    r = client.get("/api/searches/top?window_days=7&limit=5", headers=auth_headers)
    assert r.status_code == 200, r.text

    items = r.json()["items"]

    # Top result must be the normalized merged term with count=4
    assert items[0] == {"query_text": "carhartt jacket", "count": 4}

    texts = [i["query_text"] for i in items]
    assert "doc martens" in texts

    # Excluded terms must not appear
    assert "old item" not in texts
    assert "" not in texts
    # Whitespace-only after normalization should not appear as empty string either
    for t in texts:
        assert t.strip() != ""


def test_top_searches_window_filtering(client, db_session, test_user, auth_headers):
    """window_days param correctly excludes rows outside the rolling window."""
    now = time.time()

    # Within a 1-day window
    db_session.add(
        SearchQuery(user_id=test_user.id, query_text="fresh term", ts=now - 3600)
    )
    # 2 days old — outside a 1-day window
    db_session.add(
        SearchQuery(user_id=test_user.id, query_text="stale term", ts=now - 2 * 86400)
    )
    db_session.commit()

    r = client.get("/api/searches/top?window_days=1&limit=10", headers=auth_headers)
    assert r.status_code == 200, r.text

    texts = [i["query_text"] for i in r.json()["items"]]
    assert "fresh term" in texts
    assert "stale term" not in texts


def test_top_searches_limit_respected(client, db_session, test_user, auth_headers):
    """limit param caps the number of results returned."""
    now = time.time()

    # Seed 10 distinct terms
    for i in range(10):
        for _ in range(i + 1):  # vary counts so ranking is deterministic
            db_session.add(
                SearchQuery(
                    user_id=test_user.id,
                    query_text=f"term {i}",
                    ts=now - 100,
                )
            )
    db_session.commit()

    r = client.get("/api/searches/top?window_days=7&limit=3", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert len(r.json()["items"]) == 3


def test_top_searches_unauthenticated_returns_401(client):
    """No auth override → 401."""
    # Ensure no override leaks from a previous test
    main.app.dependency_overrides.pop(get_current_user, None)
    r = client.get("/api/searches/top?window_days=7&limit=5")
    assert r.status_code == 401


def test_top_searches_invalid_window_days_returns_422(client, auth_headers):
    """window_days=0 is below the ge=1 constraint → 422."""
    r = client.get("/api/searches/top?window_days=0&limit=5", headers=auth_headers)
    assert r.status_code == 422


def test_top_searches_empty_db_returns_empty_list(client, db_session, test_user, auth_headers):
    """No search_queries rows → returns empty items list, not an error."""
    # Ensure no rows exist for this user by relying on a fresh test_user
    r = client.get("/api/searches/top?window_days=7&limit=5", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json() == {"items": []}
