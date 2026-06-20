"""Shared test fixtures.

Adds the backend root to sys.path so tests can `import main` even when pytest
is invoked from the repo root.

Provides shared `client`, `db_session`, `test_user`, `authed_client`, and a
`make_user` factory. Auth is bypassed via FastAPI
`app.dependency_overrides[get_current_user]` rather than minting JWTs — the
post-Supabase architecture no longer exposes a local token-mint helper.

User seeding goes through Supabase's Admin API to satisfy the
`public.users.id → auth.users.id` FK that the migration introduced. The
`0002_users_trigger.sql` trigger auto-inserts the matching `public.users` row
when an `auth.users` row is created; the fixture then patches profile fields.
Teardown deletes the `auth.users` row, which CASCADEs to `public.users`.
"""
import os
import random
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
from sqlalchemy import text

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


# Mock UUID for in-memory `mock_user` fixture only (no DB insert).
# Deliberately uses ...0002 (not ...0001) to avoid colliding with the Cosello
# system user (services/neighborhood.py SYSTEM_USER_ID = ...0001). If a future
# test accidentally persists mock_user, this guarantees no system-data overwrite.
_MOCK_USER_UUID = "00000000-0000-0000-0000-000000000002"

# FCC test-phone range. Pick from 60000-99999 so we don't collide with the
# production-seeded test users (+15555550101-103 from seed_test_users.py).
_TEST_PHONE_PREFIX = "+15555"


def _random_test_phone() -> str:
    # Wider range (90k values instead of 40k) reduces birthday-paradox phone
    # collisions in concurrent / large test runs without leaving the FCC test
    # block (+1-555-5xx-xxxx).
    return f"{_TEST_PHONE_PREFIX}{random.randint(10000, 99999)}"


@pytest.fixture(scope="session")
def supabase_admin():
    """Service-role Supabase client for creating/deleting `auth.users` entries.

    Skips any test that requests this fixture if env isn't configured.
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        pytest.skip(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
            "(load backend/.env before running tests)"
        )
    from supabase import create_client  # imported lazily so tests that don't
    return create_client(url, key)        # need supabase-py still import clean


def _delete_user_and_deps(db_session, user_id: str, supabase_admin) -> None:
    """Drop dependent rows then delete the auth.users row (cascades to public.users).

    Caller invokes during fixture teardown. Best-effort: cleanup errors are
    swallowed so a transient Supabase Admin API hiccup doesn't mask the actual
    test result.
    """
    db_session.query(ListingView).filter(ListingView.user_id == user_id).delete()
    db_session.query(SearchQuery).filter(SearchQuery.user_id == user_id).delete()
    db_session.query(ListingInteraction).filter(
        ListingInteraction.user_id == user_id
    ).delete()
    db_session.query(Listing).filter(Listing.user_id == user_id).delete()
    db_session.commit()
    try:
        supabase_admin.auth.admin.delete_user(user_id)
    except Exception:
        pass


def _create_test_user(
    db_session,
    supabase_admin,
    *,
    display_name: str = "Test User",
    neighborhood: str | None = "Chelsea",
    zip_code: str | None = None,
) -> User:
    """Create an auth.users + public.users pair via the Admin API.

    Returns the SQLAlchemy User instance. Caller is responsible for cleanup
    via `_delete_user_and_deps` (the `test_user` fixture handles this; ad-hoc
    callers can use `make_user` which tracks created users for teardown).
    """
    resp = supabase_admin.auth.admin.create_user(
        {"phone": _random_test_phone(), "phone_confirm": True}
    )
    auth_user = getattr(resp, "user", None) or resp
    user_id = auth_user.id

    # The 0002_users_trigger.sql trigger has already created the matching
    # public.users row; patch the profile fields. Use raw SQL because the ORM
    # User instance hasn't been fetched into this session yet.
    db_session.execute(
        text("""
            UPDATE public.users
            SET display_name = :name,
                neighborhood = :hood,
                zip_code = :zip
            WHERE id = :id
        """),
        {"name": display_name, "hood": neighborhood, "zip": zip_code, "id": user_id},
    )
    db_session.commit()

    user = db_session.query(User).filter(User.id == user_id).first()
    assert user is not None, f"public.users row missing for {user_id} — trigger drift?"
    return user


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
def test_user(db_session, supabase_admin):
    """Seed a fresh user via the Supabase Admin API for the test, tear down at end.

    The UUID is dynamic (Supabase mints it); tests that need the id reference
    `test_user.id` rather than a module-level constant.
    """
    user = _create_test_user(db_session, supabase_admin)
    yield user
    _delete_user_and_deps(db_session, user.id, supabase_admin)


@pytest.fixture
def make_user(db_session, supabase_admin):
    """Factory for ad-hoc additional users (e.g. ranking tests that need a
    second-party user). Tracks created users and tears them all down at end-of-test.
    """
    created: list[str] = []

    def _make(*, display_name: str = "Test User", neighborhood: str | None = None,
              zip_code: str | None = None) -> User:
        u = _create_test_user(
            db_session,
            supabase_admin,
            display_name=display_name,
            neighborhood=neighborhood,
            zip_code=zip_code,
        )
        created.append(u.id)
        return u

    yield _make

    for user_id in created:
        _delete_user_and_deps(db_session, user_id, supabase_admin)


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
    user row. Avoids the `auth.users` FK constraint entirely."""
    return User(
        id=_MOCK_USER_UUID,
        display_name="Mock User",
        neighborhood="SoHo",
    )


_MOCK_STORAGE_PREFIX = "https://test.storage.fake/"


@pytest.fixture
def mock_storage(monkeypatch):
    """Replace `services.storage` upload/download/is_storage_url with an
    in-memory dict, so listing-pipeline tests can run without hitting Supabase
    Storage. Returns the dict so tests can pre-register bytes at known URLs
    (for `download_image`) or inspect what an endpoint uploaded.

    URL shape mirrors prod (`https://test.storage.fake/<category>/<owner>/<idx>.<ext>`)
    so assertions about URL prefixes and `is_storage_url(...)` still hold.
    """
    from services import storage

    store: dict[str, bytes] = {}

    def _fake_upload(category: str, owner_id: str, raw_bytes: bytes, ext: str) -> str:
        ext_norm = (ext or "jpg").lower().lstrip(".")
        url = f"{_MOCK_STORAGE_PREFIX}{category}/{owner_id}/{len(store)}.{ext_norm}"
        store[url] = raw_bytes
        return url

    def _fake_download(url: str) -> bytes:
        if url in store:
            return store[url]
        raise ValueError(f"mock_storage: no bytes registered at {url!r}")

    def _fake_is_storage_url(url: str | None) -> bool:
        return bool(url) and url.startswith(_MOCK_STORAGE_PREFIX)

    monkeypatch.setattr(storage, "upload_image", _fake_upload)
    monkeypatch.setattr(storage, "download_image", _fake_download)
    monkeypatch.setattr(storage, "is_storage_url", _fake_is_storage_url)

    return store
