"""Reset a dev phone user back to a pre-registration state so the registration
wizard can be re-run via Supabase phone Test OTPs (no real SMS sent).

After you complete the wizard for a test phone number, that user has a profile
and will skip the wizard. Run this to blank its profile (and drop the community
memberships the wizard created) so the next Test-OTP sign-in with that number
lands in the wizard again. This is the prod sign-up path — identical to prod,
just with a static OTP.

Targets whatever SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL are in
the environment (export .env.test first to hit cosello-dev). The phone defaults
to the registration test number; pass another as the first arg:

    cd backend && set -a && source .env.test && set +a && python -m scripts.reset_dev_new_user [+15555550199]
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
# Base .env; already-exported vars win (override defaults False) so sourcing
# .env.test before running targets cosello-dev.
load_dotenv(BACKEND_DIR / ".env")

from supabase import create_client  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

# Reserved registration test number — not pre-seeded with a profile, so its
# first Test-OTP sign-in goes through the genuine new-user signup → wizard.
DEFAULT_PHONE = "+15555550199"


def _norm(phone: str) -> str:
    return (phone or "").lstrip("+")


def _find_user_id(sb, phone: str) -> str | None:
    target = _norm(phone)
    page = 1
    while page <= 25:
        users = sb.auth.admin.list_users(page=page, per_page=200)
        if not users:
            return None
        for u in users:
            if _norm(getattr(u, "phone", "") or "") == target:
                return u.id
        if len(users) < 200:
            return None
        page += 1
    return None


def main() -> None:
    phone = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PHONE
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    db_url = os.environ.get("DATABASE_URL")
    if not (url and key and db_url):
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL must be set")

    sb = create_client(url, key)
    uid = _find_user_id(sb, phone)
    if not uid:
        print(
            f"No auth user for {phone} yet — nothing to reset. Just sign in with "
            f"its Test OTP to register fresh (it creates the user on first verify)."
        )
        return

    # Blank the profile + drop memberships the wizard would re-create, so the
    # next sign-in lands in the registration wizard and re-registration is clean.
    eng = create_engine(db_url, connect_args={"connect_timeout": 15})
    with eng.begin() as c:
        c.execute(text("DELETE FROM community_members WHERE user_id = :id"), {"id": uid})
        c.execute(
            text(
                """
                UPDATE public.users
                SET display_name = NULL, neighborhood = NULL, zip_code = NULL,
                    pickup_address = NULL, profile_picture = NULL
                WHERE id = :id
                """
            ),
            {"id": uid},
        )
    print(f"reset {phone} ({uid}) → pre-registration. Next Test-OTP sign-in lands in the wizard.")


if __name__ == "__main__":
    main()
