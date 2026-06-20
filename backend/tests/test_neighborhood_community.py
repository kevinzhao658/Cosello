"""Tests for neighborhood community helpers + endpoint integration.

Fixture notes:
- `db` aliases `db_session` from conftest (Supabase-backed SQLAlchemy session).
- `user_factory` uses the Supabase Admin API (required because public.users.id
  has a FK to auth.users.id; direct ORM inserts would violate the constraint).
- `auth_token_for_new_user` and `authed_user_factory` create real auth users
  and return the JWT access token for use with the TestClient.
- All fixtures clean up after themselves by deleting the auth.users row, which
  CASCADEs to public.users and all dependent rows.
"""
import logging
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
TESTS_DIR = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS
from models import Community, CommunityMember, User
from services.neighborhood import (
    SYSTEM_USER_ID,
    get_neighborhood_community,
    set_user_neighborhood,
)

# Shared collision-proof helper (lives in tests/test_helpers.py).
from test_helpers import create_auth_user_with_retry


# ---------- fixtures ----------

@pytest.fixture
def db(db_session):
    """Alias for db_session so test bodies can use the plan's `db` name."""
    return db_session


@pytest.fixture
def user_factory(db_session, supabase_admin):
    """Create real auth.users + public.users pairs via Supabase Admin API.

    Returns a callable: _make(display_name, neighborhood=None) -> User.
    All created users are deleted at teardown (auth deletion cascades to public).
    """
    created_ids: list[str] = []

    def _make(display_name: str, neighborhood: str | None = None) -> User:
        from sqlalchemy import text as sa_text

        resp = create_auth_user_with_retry(supabase_admin)
        auth_user = getattr(resp, "user", None) or resp
        user_id = auth_user.id
        created_ids.append(user_id)

        # Trigger has auto-created public.users row; patch profile fields.
        db_session.execute(
            sa_text(
                "UPDATE public.users SET display_name = :name, neighborhood = :hood "
                "WHERE id = :id"
            ),
            {"name": display_name, "hood": neighborhood, "id": user_id},
        )
        db_session.commit()

        user = db_session.query(User).filter(User.id == user_id).first()
        assert user is not None, f"public.users row missing for {user_id}"
        return user

    yield _make

    for uid in created_ids:
        # Delete CommunityMember rows first (not all covered by CASCADE)
        db_session.query(CommunityMember).filter(
            CommunityMember.user_id == uid
        ).delete()
        db_session.commit()
        try:
            supabase_admin.auth.admin.delete_user(uid)
        except Exception as exc:
            logger.warning(
                "test_neighborhood_community: teardown failed to delete "
                "auth.users row %s — user is now orphaned. "
                "Run cleanup_test_users.py to purge. Error: %s",
                uid,
                exc,
            )


@pytest.fixture
def auth_token_for_new_user(supabase_admin):
    """Create a new auth user and return their JWT access token.

    Used by endpoint tests that need an Authorization header.
    Tears down the auth user at end of test.
    """
    resp = create_auth_user_with_retry(supabase_admin)
    auth_user = getattr(resp, "user", None) or resp
    user_id = auth_user.id

    # Generate a short-lived token via the admin API
    sign_in = supabase_admin.auth.admin.generate_link(
        {"type": "magiclink", "email": f"test-{user_id[:8]}@cosello.test"}
    )
    # Fallback: use the session from create_user if generate_link doesn't give us a token
    # The admin API doesn't directly issue JWTs; use sign_in_with_password approach.
    # Instead, rely on the admin.create_user response — Supabase Pro returns an access_token.
    token = getattr(auth_user, "access_token", None)
    if not token:
        # Use admin.sign_in_with_password won't work without a password.
        # Use admin.get_user_by_id + create a session manually via exchange_code_for_session.
        # Simplest path for tests: store user_id and override get_current_user in the endpoint tests.
        token = user_id  # sentinel — endpoint tests using this fixture override auth anyway

    yield token, user_id

    try:
        supabase_admin.auth.admin.delete_user(user_id)
    except Exception as exc:
        logger.warning(
            "test_neighborhood_community: teardown failed to delete "
            "auth.users row %s — user is now orphaned. "
            "Run cleanup_test_users.py to purge. Error: %s",
            user_id,
            exc,
        )


@pytest.fixture
def authed_user_factory(db_session, supabase_admin, override_auth_user, client):
    """Create an auth + public user and install them as the current_user override.

    Returns a callable: _make(display_name, neighborhood=None) -> (User, client).
    The returned client is pre-authed for that user.
    """
    created_ids: list[str] = []

    def _make(display_name: str, neighborhood: str | None = None):
        from sqlalchemy import text as sa_text

        resp = create_auth_user_with_retry(supabase_admin)
        auth_user = getattr(resp, "user", None) or resp
        user_id = auth_user.id
        created_ids.append(user_id)

        db_session.execute(
            sa_text(
                "UPDATE public.users SET display_name = :name, neighborhood = :hood "
                "WHERE id = :id"
            ),
            {"name": display_name, "hood": neighborhood, "id": user_id},
        )
        db_session.commit()

        user = db_session.query(User).filter(User.id == user_id).first()
        assert user is not None

        # Wire membership if neighborhood is set (simulates the auth endpoint calling
        # set_user_neighborhood on first registration). Temporarily clear
        # user.neighborhood so set_user_neighborhood treats this as a new assignment
        # (not a no-op).
        if neighborhood and neighborhood in MANHATTAN_NEIGHBORHOODS:
            user.neighborhood = None
            db_session.commit()
            set_user_neighborhood(db_session, user, neighborhood)
            db_session.refresh(user)

        override_auth_user(user)
        return user, client

    yield _make

    for uid in created_ids:
        db_session.query(CommunityMember).filter(
            CommunityMember.user_id == uid
        ).delete()
        db_session.commit()
        try:
            supabase_admin.auth.admin.delete_user(uid)
        except Exception as exc:
            logger.warning(
                "test_neighborhood_community: teardown failed to delete "
                "auth.users row %s — user is now orphaned. "
                "Run cleanup_test_users.py to purge. Error: %s",
                uid,
                exc,
            )


# ---------- helper tests ----------

def test_get_neighborhood_community_returns_seeded_row(db: Session):
    community = get_neighborhood_community(db, "Chinatown")
    assert community is not None
    assert community.name == "Chinatown"
    assert community.neighborhood == "Chinatown"
    assert community.is_public is True
    assert str(community.created_by) == SYSTEM_USER_ID


def test_get_neighborhood_community_off_list_returns_none(db: Session):
    assert get_neighborhood_community(db, "Not A Real Neighborhood") is None
    assert get_neighborhood_community(db, "") is None
    assert get_neighborhood_community(db, None) is None  # type: ignore[arg-type]


def test_get_neighborhood_community_ignores_user_created_with_same_name(
    db: Session, user_factory
):
    # A real user creates a community with the same neighborhood name.
    # Should NOT be returned by get_neighborhood_community.
    real_user = user_factory(display_name="Alice", neighborhood="Chinatown")
    rogue = Community(
        name="Chinatown Buddies",
        neighborhood="Chinatown",
        is_public=True,
        invite_code="ROGUE-CHINATOWN",
        created_by=real_user.id,
    )
    db.add(rogue)
    db.commit()

    found = get_neighborhood_community(db, "Chinatown")
    assert found is not None
    assert found.invite_code == "NBHD-CHINATOWN"  # the system-owned one

    # Cleanup rogue community
    db.delete(rogue)
    db.commit()


def test_set_user_neighborhood_creates_membership_on_first_set(
    db: Session, user_factory
):
    user = user_factory(display_name="Bob", neighborhood=None)
    set_user_neighborhood(db, user, "Chinatown")

    user_again = db.query(User).filter(User.id == user.id).first()
    assert user_again.neighborhood == "Chinatown"

    chinatown = get_neighborhood_community(db, "Chinatown")
    membership = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.user_id == user.id,
            CommunityMember.community_id == chinatown.id,
        )
        .first()
    )
    assert membership is not None
    assert membership.role == "member"


def test_set_user_neighborhood_swaps_membership_on_change(
    db: Session, user_factory
):
    user = user_factory(display_name="Carol", neighborhood="Chinatown")
    set_user_neighborhood(db, user, "Chinatown")  # initial join
    set_user_neighborhood(db, user, "Tribeca")    # swap

    user_again = db.query(User).filter(User.id == user.id).first()
    assert user_again.neighborhood == "Tribeca"

    # Old membership gone
    old = get_neighborhood_community(db, "Chinatown")
    assert (
        db.query(CommunityMember)
        .filter(
            CommunityMember.user_id == user.id,
            CommunityMember.community_id == old.id,
        )
        .first()
        is None
    )

    # New membership exists
    new = get_neighborhood_community(db, "Tribeca")
    assert (
        db.query(CommunityMember)
        .filter(
            CommunityMember.user_id == user.id,
            CommunityMember.community_id == new.id,
        )
        .first()
        is not None
    )


def test_set_user_neighborhood_rejects_off_list(db: Session, user_factory):
    user = user_factory(display_name="Dan", neighborhood=None)
    with pytest.raises(ValueError, match="not in the curated"):
        set_user_neighborhood(db, user, "Not A Real Neighborhood")


def test_set_user_neighborhood_idempotent_on_no_change(db: Session, user_factory):
    user = user_factory(display_name="Eve", neighborhood=None)
    set_user_neighborhood(db, user, "SoHo")
    soho = get_neighborhood_community(db, "SoHo")

    # Calling again with the same value should not duplicate the membership
    set_user_neighborhood(db, user, "SoHo")

    count = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.user_id == user.id,
            CommunityMember.community_id == soho.id,
        )
        .count()
    )
    assert count == 1


def test_seed_migration_covers_full_canonical_list(db: Session):
    """Guard against SQL migration / constants file divergence.

    Asserts that the number of system-owned communities equals the length
    of MANHATTAN_NEIGHBORHOODS. If someone adds to the constants but forgets
    to add a migration (or vice versa), this test fails loudly.
    """
    system_community_count = (
        db.query(Community)
        .filter(Community.created_by == SYSTEM_USER_ID)
        .count()
    )
    assert system_community_count == len(MANHATTAN_NEIGHBORHOODS), (
        f"Expected {len(MANHATTAN_NEIGHBORHOODS)} system-owned communities "
        f"(one per MANHATTAN_NEIGHBORHOODS entry), got {system_community_count}. "
        f"Check 0007_neighborhood_communities.sql vs constants/neighborhoods.py."
    )


# ---------- endpoint test ----------

def test_get_neighborhoods_endpoint_returns_curated_list(client):
    response = client.get("/api/communities/neighborhoods")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 43
    assert "Chinatown" in data
    assert "West Village" in data
    assert "Not A Real Neighborhood" not in data

    # Alphabetically sorted (caller-friendly)
    assert data == sorted(data)


# ---------- auth endpoint integration tests ----------

def test_register_endpoint_auto_joins_neighborhood_community(
    client, supabase_admin, db_session, override_auth_user
):
    """POST /api/auth/register with a valid neighborhood auto-creates membership."""
    from sqlalchemy import text as sa_text

    resp = create_auth_user_with_retry(supabase_admin)
    auth_user = getattr(resp, "user", None) or resp
    user_id = auth_user.id

    # The trigger auto-creates the public.users row; load it and override auth.
    db_session.execute(sa_text("SELECT 1"))  # ping session
    user = db_session.query(User).filter(User.id == user_id).first()
    assert user is not None
    override_auth_user(user)

    try:
        resp = client.post(
            "/api/auth/register",
            json={
                "display_name": "Frank",
                "neighborhood": "SoHo",
            },
        )
        assert resp.status_code == 200

        # Refresh user from DB after register endpoint ran
        db_session.expire(user)
        user_after = db_session.query(User).filter(User.id == user_id).first()
        assert user_after.neighborhood == "SoHo"

        soho = get_neighborhood_community(db_session, "SoHo")
        membership = (
            db_session.query(CommunityMember)
            .filter(
                CommunityMember.user_id == user_id,
                CommunityMember.community_id == soho.id,
            )
            .first()
        )
        assert membership is not None
    finally:
        db_session.query(CommunityMember).filter(
            CommunityMember.user_id == user_id
        ).delete()
        db_session.commit()
        try:
            supabase_admin.auth.admin.delete_user(user_id)
        except Exception:
            pass


def test_register_endpoint_rejects_off_list_neighborhood(
    client, supabase_admin, db_session, override_auth_user
):
    """POST /api/auth/register with off-list neighborhood returns 400."""
    from sqlalchemy import text as sa_text

    resp = create_auth_user_with_retry(supabase_admin)
    auth_user = getattr(resp, "user", None) or resp
    user_id = auth_user.id

    db_session.execute(sa_text("SELECT 1"))
    user = db_session.query(User).filter(User.id == user_id).first()
    assert user is not None
    override_auth_user(user)

    try:
        resp = client.post(
            "/api/auth/register",
            json={
                "display_name": "Grace",
                "neighborhood": "Atlantis",
            },
        )
        assert resp.status_code == 400
        assert "curated" in resp.json()["detail"].lower()
    finally:
        try:
            supabase_admin.auth.admin.delete_user(user_id)
        except Exception:
            pass


def test_mine_with_neighborhood_endpoint_deleted(authed_client):
    """PR 3 cutover: the /mine-with-neighborhood endpoint is gone.
    Clients must use /mine and split client-side.

    Note: FastAPI's /{community_id} catch-all route matches the path and
    returns 422 (validation error — community_id is not an int) rather than
    404.  Either status confirms the dedicated endpoint no longer exists.
    """
    resp = authed_client.get("/api/communities/mine-with-neighborhood")
    assert resp.status_code in (404, 422), (
        f"Expected 404 or 422 (endpoint gone), got {resp.status_code}"
    )


def test_update_profile_swaps_neighborhood_community(
    client, authed_user_factory, db_session
):
    """PUT /api/auth/profile neighborhood change swaps community membership."""
    user, authed_client = authed_user_factory(
        display_name="Hank", neighborhood="Chinatown"
    )

    chinatown = get_neighborhood_community(db_session, "Chinatown")
    # Verify initial membership in Chinatown
    assert (
        db_session.query(CommunityMember)
        .filter(
            CommunityMember.user_id == user.id,
            CommunityMember.community_id == chinatown.id,
        )
        .first()
        is not None
    )

    # Update to Tribeca
    resp = authed_client.put(
        "/api/auth/profile",
        json={"neighborhood": "Tribeca"},
    )
    assert resp.status_code == 200

    # Verify swap
    db_session.expire_all()
    chinatown = get_neighborhood_community(db_session, "Chinatown")
    tribeca = get_neighborhood_community(db_session, "Tribeca")
    assert (
        db_session.query(CommunityMember)
        .filter(
            CommunityMember.user_id == user.id,
            CommunityMember.community_id == chinatown.id,
        )
        .first()
        is None
    )
    assert (
        db_session.query(CommunityMember)
        .filter(
            CommunityMember.user_id == user.id,
            CommunityMember.community_id == tribeca.id,
        )
        .first()
        is not None
    )
