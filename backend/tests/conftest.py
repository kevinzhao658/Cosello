"""Shared test fixtures.

Adds the backend root to sys.path so tests can `import main` even when pytest
is invoked from the repo root.

Provides shared `client`, `db_session`, `test_user`, and `authed_client`
fixtures. Auth is bypassed via FastAPI `app.dependency_overrides[get_current_user]`
rather than minting JWTs — the post-Supabase architecture no longer exposes a
local token-mint helper.
"""
import os
import sys
from pathlib import Path

# Backend is the parent of this tests directory.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Anthropic SDK refuses to construct without an API key. Set a dummy one for tests
# (the client itself is monkeypatched per-test).
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test-fake")


import pytest
from fastapi.testclient import TestClient

import main
from auth import get_current_user
from database import SessionLocal
from models import (
    Listing,
    ListingInteraction,
    ListingView,
    SearchQuery,
    User,
)


TEST_USER_UUID = "00000000-0000-0000-0000-000000000001"
TEST_USER_2_UUID = "00000000-0000-0000-0000-000000000002"


@pytest.fixture
def client():
    return TestClient(main.app)


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_user(db_session):
    """Seed a deterministic UUID-keyed user; tear down at end of test.

    Cleans up FK-referencing event rows before dropping the user so other test
    fixtures (like `test_listing`) can run alongside without ordering hazards.
    """
    user = User(id=TEST_USER_UUID, display_name="Test User", neighborhood="Chelsea")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    yield user
    db_session.query(ListingView).filter(ListingView.user_id == TEST_USER_UUID).delete()
    db_session.query(SearchQuery).filter(SearchQuery.user_id == TEST_USER_UUID).delete()
    db_session.query(ListingInteraction).filter(
        ListingInteraction.user_id == TEST_USER_UUID
    ).delete()
    db_session.query(Listing).filter(Listing.user_id == TEST_USER_UUID).delete()
    db_session.query(User).filter(User.id == TEST_USER_UUID).delete()
    db_session.commit()


@pytest.fixture
def override_auth_user():
    """Per-test helper to install/swap the `get_current_user` dependency override.

    Tests that need to switch the "current user" between calls (e.g. ranking
    tests that spin up ad-hoc users) get a callable they can invoke with any
    `User` instance. Teardown always pops the override so tests stay isolated.
    """
    def _set(user):
        main.app.dependency_overrides[get_current_user] = lambda: user

    yield _set
    main.app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def authed_client(client, test_user, override_auth_user):
    """A TestClient pre-authed as the shared `test_user` fixture."""
    override_auth_user(test_user)
    return client


@pytest.fixture
def mock_user():
    """An in-memory User instance (NOT persisted) for tests whose endpoints
    only need a satisfied `Depends(get_current_user)` but never touch the DB
    user row. Avoids the `auth.users` FK constraint."""
    return User(
        id=TEST_USER_UUID,
        display_name="Mock User",
        neighborhood="SoHo",
    )
