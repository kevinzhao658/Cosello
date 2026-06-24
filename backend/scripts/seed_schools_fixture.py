"""Load the curated `school_seed` fixture into the school_seed table.

`backend/data/school_seed.csv` is a snapshot of the **already-curated** school
list — normalized display `name`, `short_name`, and `acronym` (the output of the
normalize_school_names + backfill_school_short_names/acronyms pipeline). Loading
this single committed artifact makes any environment match the canonical list
exactly, instead of re-deriving from the gitignored ~100 MB College Scorecard
CSV. This is the standard per-environment school seed.

To REGENERATE the fixture itself (only when the underlying data changes), dump a
curated `school_seed` table to CSV with columns: name,state,acronym,short_name.

Run (export .env.test first to target cosello-dev):
    cd backend && set -a && source .env.test && set +a && python -m scripts.seed_schools_fixture
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
import psycopg2

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")  # base; exported vars (e.g. from .env.test) win

FIXTURE = BACKEND_DIR / "data" / "school_seed.csv"


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL must be set")
    if not FIXTURE.exists():
        raise SystemExit(f"fixture not found: {FIXTURE}")
    # Use the session pooler (5432): the full reload's DELETE touches an
    # FK-referenced table, which the transaction pooler's short statement timeout
    # can cancel. Session mode tolerates the larger op and lets us raise the limit.
    url = url.replace(":6543/", ":5432/")

    conn = psycopg2.connect(url, connect_timeout=20)
    try:
        cur = conn.cursor()
        cur.execute("SET statement_timeout = '120s'")
        cur.execute("DELETE FROM school_seed")
        with open(FIXTURE) as f:
            next(f)  # skip header
            cur.copy_expert(
                "COPY school_seed (name,state,acronym,short_name) "
                "FROM STDIN WITH (FORMAT csv, NULL '')",
                f,
            )
        conn.commit()
        cur.execute("SELECT count(*) FROM school_seed")
        print(f"loaded {cur.fetchone()[0]} schools from {FIXTURE.name}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
