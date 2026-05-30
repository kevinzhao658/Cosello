"""One-shot cleanup for test-fixture listings that leaked into the live DB.

Targets listings created by `backend/tests/test_ranking.py:_mk_listing`, which
uses an `id` of the form `rnk-{epoch_us}-{name_prefix}`. The test cleanup
fixture is supposed to delete these after each run but has been unreliable —
re-run this script when stray "B Skipped" / "A Keeper" listings show up in
the feed.

Defensive: dry-run by default, requires `--confirm` to actually delete.
Targets rows where ALL of these hold:
  - `id` starts with `rnk-`
  - brand IN ('A', 'B')         # _mk_listing default brands for these tests
  - name IN ('Keeper', 'Skipped')

Also clears `listing_views` and `listing_interactions` rows that FK to the
targeted listings, in that order, to avoid FK violations.

Usage (from backend/):
    python3 scripts/cleanup_test_fixtures.py            # dry-run
    python3 scripts/cleanup_test_fixtures.py --confirm  # actually delete
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from database import SessionLocal
from models import Listing, ListingInteraction, ListingView

TARGET_BRANDS = {"A", "B"}
TARGET_NAMES = {"Keeper", "Skipped"}
ID_PREFIX = "rnk-"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm", action="store_true",
                        help="Actually delete. Without this, runs as a dry-run.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        listings = (
            db.query(Listing)
            .filter(Listing.id.like(f"{ID_PREFIX}%"))
            .filter(Listing.brand.in_(TARGET_BRANDS))
            .filter(Listing.name.in_(TARGET_NAMES))
            .all()
        )

        if not listings:
            print("No matching test-fixture listings found. Nothing to clean.")
            return 0

        listing_ids = [l.id for l in listings]
        view_count = (
            db.query(ListingView)
            .filter(ListingView.listing_id.in_(listing_ids))
            .count()
        )
        interaction_count = (
            db.query(ListingInteraction)
            .filter(ListingInteraction.listing_id.in_(listing_ids))
            .count()
        )

        print(f"Found {len(listings)} listing(s) matching the test-fixture signature:")
        for l in listings:
            print(f"  - {l.id!r}  brand={l.brand!r}  name={l.name!r}  user_id={l.user_id}")
        print(f"  + {view_count} listing_views row(s) referencing these listings")
        print(f"  + {interaction_count} listing_interactions row(s) referencing these listings")

        if not args.confirm:
            print()
            print("DRY-RUN — re-run with --confirm to actually delete.")
            return 0

        deleted_views = (
            db.query(ListingView)
            .filter(ListingView.listing_id.in_(listing_ids))
            .delete(synchronize_session=False)
        )
        deleted_interactions = (
            db.query(ListingInteraction)
            .filter(ListingInteraction.listing_id.in_(listing_ids))
            .delete(synchronize_session=False)
        )
        deleted_listings = (
            db.query(Listing)
            .filter(Listing.id.in_(listing_ids))
            .delete(synchronize_session=False)
        )
        db.commit()

        print()
        print(f"Deleted {deleted_views} listing_views, "
              f"{deleted_interactions} listing_interactions, "
              f"{deleted_listings} listings.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
