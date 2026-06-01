"""Tests for GET /api/searches/top — top-searches aggregation endpoint.

Covers:
  - Ranking by count descending
  - Normalization: lowercase + trim merges "Carhartt Jacket" / "carhartt jacket "
    (counts still aggregate across the merged term)
  - Distinct-user threshold: a term must be searched by >=5 distinct users to surface
  - Blank-term exclusion (whitespace-only query_text rows are omitted)
  - Window filtering: rows older than window_days are excluded
  - 401 when no auth override is installed
  - Query param validation: window_days and limit boundaries
  - Empty DB returns empty items list
"""
from __future__ import annotations

import time

import pytest

import main
from auth import get_current_user
from models import SearchQuery


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


def _seed(db_session, user_id: str, query_text: str, ts: float) -> None:
    db_session.add(SearchQuery(user_id=user_id, query_text=query_text, ts=ts))


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


def test_top_searches_ranks_and_normalizes(
    client, db_session, test_user, make_user, auth_headers
):
    """Ranking by count desc + normalization (case + trailing space collapse).

    Seeds 5 distinct users for "carhartt jacket" (with case/spacing variants to
    exercise normalization) and 5 distinct users for "doc martens". Both terms
    must surface; carhartt jacket must rank first due to higher total count.
    Blank and window-excluded rows must not appear.
    """
    now = time.time()

    # Build a pool of 5 extra users (test_user + 4 more) for carhartt jacket.
    extra_users = [make_user() for _ in range(4)]
    carhartt_users = [test_user] + extra_users

    # Spread case/spacing variants across those 5 users to exercise normalization.
    variants = [
        "Carhartt Jacket",
        "carhartt jacket",
        "CARHARTT JACKET",
        "carhartt jacket ",   # trailing space
        "Carhartt Jacket",    # repeat variant — still same user, counts once for distinct
    ]
    for u, variant in zip(carhartt_users, variants):
        _seed(db_session, u.id, variant, now - 100)
    # One extra repeat from carhartt_users[0] — pushes total count to 6, distinct stays 5.
    _seed(db_session, carhartt_users[0].id, "carhartt jacket", now - 50)

    # 5 distinct users for "doc martens" (count=5, so it surfaces but ranks below carhartt).
    doc_users = [make_user() for _ in range(5)]
    for u in doc_users:
        _seed(db_session, u.id, "doc martens", now - 50)

    # Blank / whitespace-only — excluded regardless of user count.
    _seed(db_session, test_user.id, "   ", now - 50)

    # Outside the 7-day window (90 days ago) — excluded regardless of user count.
    _seed(db_session, test_user.id, "old item", now - 90 * 86400)

    db_session.commit()

    r = client.get("/api/searches/top?window_days=7&limit=10", headers=auth_headers)
    assert r.status_code == 200, r.text

    items = r.json()["items"]
    texts = [i["query_text"] for i in items]

    # carhartt jacket: 6 total rows, 5 distinct users → surfaces with count=6
    assert items[0]["query_text"] == "carhartt jacket"
    assert items[0]["count"] == 6

    # doc martens: 5 distinct users → surfaces
    assert "doc martens" in texts

    # Excluded terms must not appear
    assert "old item" not in texts
    assert "" not in texts
    for t in texts:
        assert t.strip() != ""


def test_top_searches_distinct_user_threshold(
    client, db_session, test_user, make_user, auth_headers
):
    """A term with 4 distinct users must NOT surface; adding a 5th makes it surface."""
    now = time.time()
    users = [test_user] + [make_user() for _ in range(4)]  # 5 total

    # Seed only the first 4 users — below threshold.
    for u in users[:4]:
        _seed(db_session, u.id, "below threshold", now - 100)
    db_session.commit()

    r = client.get("/api/searches/top?window_days=7&limit=10", headers=auth_headers)
    assert r.status_code == 200, r.text
    texts_before = [i["query_text"] for i in r.json()["items"]]
    assert "below threshold" not in texts_before, "term with 4 distinct users must not surface"

    # Add the 5th user — now meets the threshold.
    _seed(db_session, users[4].id, "below threshold", now - 100)
    db_session.commit()

    r = client.get("/api/searches/top?window_days=7&limit=10", headers=auth_headers)
    assert r.status_code == 200, r.text
    texts_after = [i["query_text"] for i in r.json()["items"]]
    assert "below threshold" in texts_after, "term with 5 distinct users must surface"


def test_top_searches_window_filtering(
    client, db_session, test_user, make_user, auth_headers
):
    """window_days param correctly excludes rows outside the rolling window."""
    now = time.time()

    # "fresh term": 5 distinct users all within the last hour — should surface.
    fresh_users = [test_user] + [make_user() for _ in range(4)]
    for u in fresh_users:
        _seed(db_session, u.id, "fresh term", now - 3600)

    # "stale term": 5 distinct users but all 2 days old — outside a 1-day window.
    stale_users = [make_user() for _ in range(5)]
    for u in stale_users:
        _seed(db_session, u.id, "stale term", now - 2 * 86400)

    db_session.commit()

    r = client.get("/api/searches/top?window_days=1&limit=10", headers=auth_headers)
    assert r.status_code == 200, r.text

    texts = [i["query_text"] for i in r.json()["items"]]
    assert "fresh term" in texts
    assert "stale term" not in texts


def test_top_searches_limit_respected(
    client, db_session, test_user, make_user, auth_headers
):
    """limit param caps the number of results returned."""
    now = time.time()

    # Seed 10 distinct terms, each by 5 distinct users, with varied counts so
    # ranking is deterministic and all 10 meet the threshold.
    base_users = [test_user] + [make_user() for _ in range(4)]

    for i in range(10):
        for u in base_users:
            # Each user searches "term i" once; vary counts by adding extra rows
            # from user 0 so ranking remains deterministic.
            _seed(db_session, u.id, f"term {i}", now - 100)
        for _ in range(i):  # i extra rows from test_user → total count = 5+i
            _seed(db_session, test_user.id, f"term {i}", now - 100)

    db_session.commit()

    r = client.get("/api/searches/top?window_days=7&limit=3", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert len(r.json()["items"]) == 3


def test_top_searches_unauthenticated_returns_401(client):
    """No auth override → 401."""
    # Ensure no override leaks from a previous test.
    main.app.dependency_overrides.pop(get_current_user, None)
    r = client.get("/api/searches/top?window_days=7&limit=5")
    assert r.status_code == 401


def test_top_searches_invalid_window_days_returns_422(client, auth_headers):
    """window_days=0 is below the ge=1 constraint → 422."""
    r = client.get("/api/searches/top?window_days=0&limit=5", headers=auth_headers)
    assert r.status_code == 422


def test_top_searches_empty_db_returns_empty_list(
    client, db_session, test_user, auth_headers
):
    """No search_queries rows → returns empty items list, not an error."""
    r = client.get("/api/searches/top?window_days=7&limit=5", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json() == {"items": []}
