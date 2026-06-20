"""Backfill the acronym column on existing school_seed rows.

Idempotent: only updates rows where the stored acronym differs from the
computed value (or where acronym IS NULL and compute_acronym returns a
non-None value). Rows for which compute_acronym returns None stay NULL.

Run: cd backend && python -m scripts.backfill_school_acronyms

Uses a single raw SQL UPDATE … FROM (VALUES …) statement preceded by
SET statement_timeout = 0 so it is not subject to the pooler's default
short timeout. Passes statement_timeout=0 both as a connection startup
option and as an explicit SET so it holds for the full session.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

import psycopg2

from models import SchoolSeed
from services.circles import compute_acronym

def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    # Append options to disable statement timeout at the connection level.
    # This works on both direct Postgres and Supabase pooler connections.
    dsn = database_url
    if "?" not in dsn:
        dsn += "?options=-c%20statement_timeout%3D0"
    else:
        dsn += "&options=-c%20statement_timeout%3D0"

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor()

    # Disable statement timeout for this session so the bulk UPDATE is not
    # killed mid-flight.
    cur.execute("SET statement_timeout = 0")

    # Fetch all rows.
    cur.execute("SELECT id, name, acronym FROM public.school_seed")
    rows = cur.fetchall()
    total = len(rows)

    # Compute which rows need updating.
    to_update: list[tuple[int, str | None]] = []
    for row_id, name, stored in rows:
        computed = compute_acronym(name)
        if stored != computed:
            to_update.append((row_id, computed))

    updated = len(to_update)

    if not to_update:
        print(f"Total school_seed rows : {total}")
        print("Updated this run       : 0 (all acronyms already correct)")
        conn.close()
        return

    # Build a single UPDATE … FROM (VALUES …) statement. psycopg2 mogrify is
    # used to safely quote each value; NULL acronyms become SQL NULL.
    value_rows: list[bytes] = []
    for row_id, acr in to_update:
        if acr is None:
            value_rows.append(cur.mogrify("(%s, NULL)", (row_id,)))
        else:
            value_rows.append(cur.mogrify("(%s, %s)", (row_id, acr)))

    values_sql = b", ".join(value_rows)
    cur.execute(
        b"""
        UPDATE public.school_seed AS s
           SET acronym = v.acr
          FROM (VALUES """ + values_sql + b""") AS v(id, acr)
         WHERE s.id = v.id
        """
    )
    conn.commit()

    # Re-read stats.
    cur.execute(
        "SELECT COUNT(*), COUNT(acronym) FROM public.school_seed"
    )
    total_db, non_null = cur.fetchone()
    null_count = total_db - non_null

    print(f"Total school_seed rows : {total_db}")
    print(f"Updated this run       : {updated}")
    print(f"Non-NULL acronym       : {non_null}")
    print(f"NULL acronym           : {null_count} (single-word or all-stopword names)")

    conn.close()


if __name__ == "__main__":
    main()
