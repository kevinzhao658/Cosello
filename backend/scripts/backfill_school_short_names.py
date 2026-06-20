"""Backfill school_seed.short_name.

short_name = curated override (for schools whose acronym isn't recognizable)
             ?? computed acronym
             ?? full name

Idempotent: only updates rows whose stored short_name differs from the target.
Run: cd backend && python -m scripts.backfill_school_short_names
"""
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

import psycopg2
from services.circles import compute_acronym

# Schools whose acronym is NOT the recognizable form. Keyed by exact seed name.
# Extend as new in-use schools surface (school communities are created on demand,
# so this set stays small).
CURATED: dict[str, str] = {
    "Columbia University": "Columbia",
    "Parsons School of Design": "Parsons",
    "Fordham University": "Fordham",
    "Pace University": "Pace",
    "The New School": "The New School",
    "Cooper Union": "Cooper Union",
}


def target_short_name(name: str) -> str:
    if name in CURATED:
        return CURATED[name]
    return compute_acronym(name) or name


def main() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")
    cur.execute("SELECT id, name, short_name FROM public.school_seed")
    rows = cur.fetchall()

    to_update = [(rid, target_short_name(name)) for rid, name, stored in rows
                 if stored != target_short_name(name)]

    if not to_update:
        print(f"Total {len(rows)} rows; 0 updated (already correct)")
        conn.close()
        return

    values = b", ".join(cur.mogrify("(%s, %s)", (rid, sn)) for rid, sn in to_update)
    cur.execute(b"""
        UPDATE public.school_seed AS s SET short_name = v.sn
          FROM (VALUES """ + values + b""") AS v(id, sn) WHERE s.id = v.id
    """)
    conn.commit()
    print(f"Total {len(rows)} rows; updated {len(to_update)}")
    conn.close()


if __name__ == "__main__":
    main()
