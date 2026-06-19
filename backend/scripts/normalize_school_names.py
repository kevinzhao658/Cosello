"""Fix verbose legal school names in school_seed.

Scope: rows where `name` matches the pattern "<Name> in the City of <Place>".
These are shortened to "<Name>", stripping " in the City of <Place>" entirely.
This is NOT campus consolidation — no rows are deleted or merged.

Safety: checks the uq_school_seed_name_state UNIQUE(name, state) constraint
before applying any rename. Rows that would collide with an existing name are
reported and skipped.

Run:
    cd backend && python -m scripts.normalize_school_names [--dry-run]

Flags:
    --dry-run   Print what would change without modifying the DB.

Commit tag: fix(circles): normalize verbose "in the City of" school names
"""
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

import psycopg2

# Insert backend/ onto the path so local service imports work when invoked
# as a script rather than a module.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from services.circles import compute_acronym

# ---------------------------------------------------------------------------
# Pattern: "<Name> in the City of <Place>" → "<Name>"
# Match is case-insensitive; the trailing city phrase may be at end-of-string.
# ---------------------------------------------------------------------------
_IN_CITY_RE = re.compile(r"\s+in\s+the\s+city\s+of\s+\S+.*$", re.IGNORECASE)


def shortened_name(name: str) -> str | None:
    """Return the cleaned name, or None if the pattern does not match."""
    m = _IN_CITY_RE.search(name)
    if m is None:
        return None
    return name[: m.start()].strip()


def main(dry_run: bool = False) -> None:
    database_url = os.environ["DATABASE_URL"]
    dsn = database_url
    if "?" not in dsn:
        dsn += "?options=-c%20statement_timeout%3D0"
    else:
        dsn += "&options=-c%20statement_timeout%3D0"

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")

    # Step 1: find all rows matching "in the City of".
    cur.execute(
        "SELECT id, name, state, acronym "
        "FROM public.school_seed "
        "WHERE name ~* '\\min\\s+the\\s+city\\s+of\\s' "
        "ORDER BY name"
    )
    candidates = cur.fetchall()

    print(f"Rows matching 'in the City of' pattern: {len(candidates)}")
    print()

    if not candidates:
        print("Nothing to do.")
        conn.close()
        return

    # Step 2: for each candidate compute the shortened name and check for
    # UNIQUE constraint collisions.
    to_update: list[tuple[int, str, str, str, str | None, str | None]] = []
    # fields: (id, old_name, new_name, state, old_acronym, new_acronym)
    skipped_collisions: list[tuple[int, str, str, str]] = []

    for row_id, old_name, state, old_acronym in candidates:
        new_name = shortened_name(old_name)
        if new_name is None:
            # Pattern did not match (regex false positive from SQL side) — skip.
            print(f"  [SKIP — no Python match] id={row_id} name={old_name!r}")
            continue

        # Check for collision: does (new_name, state) already exist in the table?
        cur.execute(
            "SELECT id FROM public.school_seed "
            "WHERE name = %s AND (state = %s OR (state IS NULL AND %s IS NULL)) "
            "  AND id != %s",
            (new_name, state, state, row_id),
        )
        collision = cur.fetchone()
        if collision:
            print(
                f"  [COLLISION] id={row_id} | {old_name!r} -> {new_name!r} "
                f"(state={state}) — conflicts with existing id={collision[0]}. SKIPPED."
            )
            skipped_collisions.append((row_id, old_name, new_name, state))
            continue

        new_acronym = compute_acronym(new_name)
        to_update.append((row_id, old_name, new_name, state or "", old_acronym, new_acronym))

    print(f"Rows to rename  : {len(to_update)}")
    print(f"Collisions skipped: {len(skipped_collisions)}")
    print()

    if not to_update:
        print("Nothing to update after collision check.")
        conn.close()
        return

    # Step 3: display the planned renames.
    print("Planned renames:")
    for row_id, old_name, new_name, state, old_acr, new_acr in to_update:
        print(
            f"  id={row_id} [{state}]  {old_name!r}"
            f"\n           -> {new_name!r}  (acronym: {old_acr!r} -> {new_acr!r})"
        )
    print()

    if dry_run:
        print("[DRY RUN] No changes written.")
        conn.close()
        return

    # Step 4: apply updates.
    for row_id, old_name, new_name, state, old_acr, new_acr in to_update:
        cur.execute(
            "UPDATE public.school_seed SET name = %s, acronym = %s WHERE id = %s",
            (new_name, new_acr, row_id),
        )

    conn.commit()
    print(f"Applied {len(to_update)} rename(s).")

    # Step 5: post-state confirmation — re-query the renamed rows.
    print()
    print("Post-update confirmation (re-queried by id):")
    for row_id, old_name, new_name, state, old_acr, new_acr in to_update:
        cur.execute(
            "SELECT id, name, state, acronym FROM public.school_seed WHERE id = %s",
            (row_id,),
        )
        row = cur.fetchone()
        if row:
            print(f"  id={row[0]} [{row[2]}] name={row[1]!r}  acronym={row[3]!r}")

    # Specific sanity check: exactly one "Columbia University" in NY.
    print()
    cur.execute(
        "SELECT id, name, state, acronym FROM public.school_seed "
        "WHERE name = 'Columbia University' AND state = 'NY'"
    )
    cu_rows = cur.fetchall()
    print(f"'Columbia University' / NY rows: {len(cu_rows)}")
    for r in cu_rows:
        print(f"  id={r[0]} name={r[1]!r} state={r[2]} acronym={r[3]!r}")

    conn.close()


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    main(dry_run=dry_run)
