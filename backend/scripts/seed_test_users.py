"""Seed a fixed set of test users into Supabase Auth + public.users.

Creates `auth.users` rows via the Supabase Admin API with `phone_confirm=True`
so the rows are immediately sign-in-able via Supabase Test OTPs (configured
out-of-band in the Dashboard). The `0002_users_trigger.sql` trigger
auto-creates the matching empty `public.users` row; we then patch that row
with `display_name`, `neighborhood`, `zip_code`.

Phone numbers use the FCC-reserved `+1 555-555-01XX` test range so we never
risk dialing a real number.

Idempotent: existing phones are detected via `auth.admin.list_users()` and
skipped (the user-confirmed row + its public.users patch are left alone).

Usage (from backend/):
    python3 scripts/seed_test_users.py

Or from repo root:
    python3 backend/scripts/seed_test_users.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Make the backend package importable when invoked as a script. Mirrors
# seed_fyp_fixture.py — no __init__.py in scripts/, run as a file.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Load backend/.env so SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are populated
# before importing supabase or touching the DB.
load_dotenv(BACKEND_DIR / ".env")

from supabase import create_client  # noqa: E402


TEST_USERS: list[dict] = [
    {"phone": "+15555550101", "display_name": "Alice Test", "neighborhood": "Chelsea",  "zip_code": "10011"},
    {"phone": "+15555550102", "display_name": "Bob Test",   "neighborhood": "SoHo",     "zip_code": "10012"},
    {"phone": "+15555550103", "display_name": "Carol Test", "neighborhood": "Tribeca",  "zip_code": "10013"},
]


def _build_client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env"
        )
    return create_client(url, key)


def _find_existing_user_id(client, phone: str) -> str | None:
    """Page through auth.users to find an existing row matching `phone`.

    The supabase-py admin client exposes pagination but no server-side phone
    filter, so we walk pages until we find the row or run out. Bails after a
    generous cap so a misconfigured project can't spin forever.
    """
    page = 1
    per_page = 200
    max_pages = 50
    while page <= max_pages:
        users = client.auth.admin.list_users(page=page, per_page=per_page)
        if not users:
            return None
        for u in users:
            if getattr(u, "phone", None) == phone.lstrip("+") or getattr(u, "phone", None) == phone:
                return u.id
        if len(users) < per_page:
            return None
        page += 1
    return None


def main() -> None:
    client = _build_client()

    seeded = 0
    existed = 0
    failed = 0

    for row in TEST_USERS:
        phone = row["phone"]
        display_name = row["display_name"]
        neighborhood = row["neighborhood"]
        zip_code = row["zip_code"]

        existing_id = _find_existing_user_id(client, phone)
        if existing_id is not None:
            print(f"already exists, skipping {display_name} (uuid={existing_id}, phone={phone})")
            existed += 1
            continue

        try:
            resp = client.auth.admin.create_user({
                "phone": phone,
                "phone_confirm": True,
            })
        except Exception as e:
            print(f"FAILED to create {display_name} (phone={phone}): {e}")
            failed += 1
            continue

        user = getattr(resp, "user", None) or resp
        user_id = getattr(user, "id", None)
        if not user_id:
            print(f"FAILED to create {display_name} (phone={phone}): no id in response {resp!r}")
            failed += 1
            continue

        # The 0002_users_trigger.sql trigger has auto-inserted an empty
        # public.users row keyed on this id; patch the profile fields.
        try:
            client.table("users").update({
                "display_name": display_name,
                "neighborhood": neighborhood,
                "zip_code": zip_code,
            }).eq("id", user_id).execute()
        except Exception as e:
            print(f"FAILED to patch public.users for {display_name} (uuid={user_id}): {e}")
            failed += 1
            continue

        print(f"Seeded {display_name} (uuid={user_id}, phone={phone})")
        seeded += 1

    total = len(TEST_USERS)
    print()
    print(f"Summary: {seeded} seeded, {existed} already existed, {failed} failed (total {total})")
    print()
    print("Next steps:")
    print("1. Configure Test OTPs in Supabase Dashboard → Authentication → Providers → Phone → Test OTPs:")
    for row in TEST_USERS:
        print(f"   - {row['phone']} / 123456")
    print("2. In an incognito window, sign in with one of the above phone numbers + the matching OTP.")
    print("3. Your profile is already populated — no /api/auth/register call needed.")


if __name__ == "__main__":
    main()
