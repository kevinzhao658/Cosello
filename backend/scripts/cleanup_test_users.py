"""One-shot cleanup for orphaned test users in auth.users.

Test fixtures create Supabase auth users with phones in the FCC reserved
+15555 block.  When teardown fails silently (network hiccup, interrupted run,
etc.) those rows accumulate, shrinking the free-phone pool until random picks
collide and tests error at create_user time.

This script:
  1. Lists all auth.users via the Admin API.
  2. Selects rows whose phone starts with +15555 (or 15555 — Supabase may
     omit the leading +).
  3. Excludes the three production-seeded users (+15555550101/0102/0103).
  4. With --dry-run (default): reports count only.
  5. With --apply: deletes dependent public rows first, then deletes each
     orphan via the Admin API.

Dependency order before calling auth.admin.delete_user:
  listing_views, listing_interactions, search_queries -> listings
  community_members
  (public.users itself cascades from auth.users)

Usage (from backend/):
    python3 scripts/cleanup_test_users.py             # dry-run
    python3 scripts/cleanup_test_users.py --apply     # delete orphans

Or from repo root:
    python3 backend/scripts/cleanup_test_users.py [--apply]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env", override=True)

# --- constants ---

# FCC test block prefix — phones that start with this belong to test runs.
# Supabase stores phones without the leading "+" in some versions; we match both.
_TEST_PREFIX_CANONICAL = "+15555"
_TEST_PREFIX_BARE = "15555"

# Production-seeded users that MUST NOT be deleted (seed_test_users.py).
_PRESERVED_PHONES: frozenset[str] = frozenset({
    "+15555550101",
    "15555550101",
    "+15555550102",
    "15555550102",
    "+15555550103",
    "15555550103",
})


def _build_client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env"
        )
    from supabase import create_client
    return create_client(url, key)


def _is_test_phone(phone: str | None) -> bool:
    """Return True if `phone` is in the test block and not a preserved seed."""
    if not phone:
        return False
    if phone in _PRESERVED_PHONES:
        return False
    return phone.startswith(_TEST_PREFIX_CANONICAL) or phone.startswith(_TEST_PREFIX_BARE)


def _list_orphans(client) -> list[tuple[str, str]]:
    """Return a list of (user_id, phone) tuples for orphaned test users.

    Pages through all auth.users up to 50 pages (10k users).  Stops early
    when a page comes back shorter than per_page (last page).
    """
    orphans: list[tuple[str, str]] = []
    page = 1
    per_page = 200
    max_pages = 50

    while page <= max_pages:
        users = client.auth.admin.list_users(page=page, per_page=per_page)
        if not users:
            break
        for u in users:
            phone = getattr(u, "phone", None) or ""
            if _is_test_phone(phone):
                orphans.append((u.id, phone))
        if len(users) < per_page:
            break
        page += 1

    return orphans


def _delete_public_deps(db_session, uid: str) -> None:
    """Delete all public schema rows that would block auth.admin.delete_user.

    Supabase cannot delete an auth.users row while referencing public rows
    remain.  Correct dependency order:
      1. listing_views (FK -> listings AND users)
      2. listing_interactions by user_id (FK -> users)
      3. listing_interactions by listing_id for listings owned by uid
         (FK -> listings — must clear before deleting the listing row)
      4. search_queries (FK -> users)
      5. listings (FK -> users)
      6. community_members (FK -> users)
    The public.users row itself cascades when auth.users is deleted.
    """
    from models import (
        Community,
        CommunityMember,
        Listing,
        ListingInteraction,
        ListingView,
        SearchQuery,
    )

    # Step 1: listing_views by this user
    db_session.query(ListingView).filter(ListingView.user_id == uid).delete(
        synchronize_session=False
    )
    # Step 2: listing_interactions where THIS user is the actor
    db_session.query(ListingInteraction).filter(
        ListingInteraction.user_id == uid
    ).delete(synchronize_session=False)
    # Step 3: listing_views + listing_interactions on listings OWNED by this user
    # (other users may have viewed/interacted with this user's listings)
    owned_listing_ids = [
        row.id
        for row in db_session.query(Listing.id).filter(Listing.user_id == uid).all()
    ]
    if owned_listing_ids:
        db_session.query(ListingView).filter(
            ListingView.listing_id.in_(owned_listing_ids)
        ).delete(synchronize_session=False)
        db_session.query(ListingInteraction).filter(
            ListingInteraction.listing_id.in_(owned_listing_ids)
        ).delete(synchronize_session=False)
    # Step 4: search_queries
    db_session.query(SearchQuery).filter(SearchQuery.user_id == uid).delete(
        synchronize_session=False
    )
    # Step 5: listings
    db_session.query(Listing).filter(Listing.user_id == uid).delete(
        synchronize_session=False
    )
    # Step 6: community_members (this user as member)
    db_session.query(CommunityMember).filter(CommunityMember.user_id == uid).delete(
        synchronize_session=False
    )
    # Step 7: community_members in communities created_by this user, then the communities
    owned_community_ids = [
        row.id
        for row in db_session.query(Community.id).filter(
            Community.created_by == uid
        ).all()
    ]
    if owned_community_ids:
        db_session.query(CommunityMember).filter(
            CommunityMember.community_id.in_(owned_community_ids)
        ).delete(synchronize_session=False)
    db_session.query(Community).filter(Community.created_by == uid).delete(
        synchronize_session=False
    )
    db_session.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete orphans. Without this flag, runs as a dry-run.",
    )
    args = parser.parse_args()

    client = _build_client()

    print("Scanning auth.users for orphaned test users (phone prefix +15555)...")
    orphans = _list_orphans(client)

    if not orphans:
        print("No orphaned test users found. Nothing to do.")
        return 0

    print(f"Found {len(orphans)} orphaned test user(s).")

    if not args.apply:
        print()
        print(f"DRY-RUN — {len(orphans)} would be deleted.")
        print("Re-run with --apply to actually delete.")
        return 0

    # Apply: clear public-schema dependent rows, then delete via Admin API.
    from database import SessionLocal
    db_session = SessionLocal()

    deleted = 0
    failed = 0
    try:
        for i, (uid, phone) in enumerate(orphans, start=1):
            try:
                _delete_public_deps(db_session, uid)
                client.auth.admin.delete_user(uid)
                deleted += 1
                if i % 50 == 0:
                    print(f"  ... {i}/{len(orphans)} processed ({deleted} deleted, {failed} failed)")
            except Exception as exc:
                # Roll back the SQLAlchemy session so the next iteration starts clean.
                db_session.rollback()
                print(f"  FAILED to delete {uid} ({phone}): {exc}")
                failed += 1
    finally:
        db_session.close()

    print()
    print(f"Deleted {deleted} orphaned test user(s). {failed} failed.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
