"""Shared test utility helpers.

Not a pytest plugin — imported directly by test modules that need the
shared utilities below.  Keep this module free of pytest fixtures so it
can be imported without the pytest machinery being active.
"""
from __future__ import annotations

import logging
import random

logger = logging.getLogger(__name__)

# FCC test-phone range.  7-digit suffix → ~9M values, well above the
# birthday-paradox threshold even with accumulated orphans.  Lower bound
# starts at 1000000 to stay clear of the production-seeded test users
# (+15555550101-0103 from seed_test_users.py, which use the 0550xxx range).
_TEST_PHONE_PREFIX = "+15555"
_TEST_PHONE_MIN = 1_000_000
_TEST_PHONE_MAX = 9_999_999

# "Phone number already registered" error phrases from Supabase Admin API.
_PHONE_TAKEN_HINTS = (
    "phone number already registered",
    "duplicate",
    "already been registered",
)

_CREATE_USER_MAX_RETRIES = 5


def random_test_phone() -> str:
    """Return a random phone in the +15555 FCC test block (7-digit suffix)."""
    return f"{_TEST_PHONE_PREFIX}{random.randint(_TEST_PHONE_MIN, _TEST_PHONE_MAX)}"


def create_auth_user_with_retry(supabase_admin) -> object:
    """Call supabase_admin.auth.admin.create_user with collision retry.

    Generates a fresh random phone on each attempt.  If the Supabase Admin
    API raises a "phone already registered" error (from an orphaned prior
    test run), regenerates the phone and retries up to
    _CREATE_USER_MAX_RETRIES times.  Raises the last exception if all
    attempts are exhausted.
    """
    last_exc: Exception | None = None
    for attempt in range(1, _CREATE_USER_MAX_RETRIES + 1):
        phone = random_test_phone()
        try:
            return supabase_admin.auth.admin.create_user(
                {"phone": phone, "phone_confirm": True}
            )
        except Exception as exc:
            msg = str(exc).lower()
            if any(hint in msg for hint in _PHONE_TAKEN_HINTS):
                logger.warning(
                    "test_helpers: phone %s already registered (attempt %d/%d), retrying",
                    phone,
                    attempt,
                    _CREATE_USER_MAX_RETRIES,
                )
                last_exc = exc
                continue
            raise  # non-collision error — propagate immediately
    raise RuntimeError(
        f"Could not allocate a unique test phone after {_CREATE_USER_MAX_RETRIES} "
        "attempts — too many orphaned test users in auth.users. "
        "Run: python backend/scripts/cleanup_test_users.py --apply"
    ) from last_exc
