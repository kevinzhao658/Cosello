"""One-time loader: populate public.school_seed from a US higher-ed CSV.

Usage: python -m scripts.seed_schools backend/data/us_higher_ed.csv
Idempotent: clears and reloads the table. The INSERT uses ON CONFLICT DO NOTHING
on (name, state) as a safety net so partial re-runs cannot introduce duplicates
even if the DELETE is somehow skipped.
"""
import csv
import io
import sys

from sqlalchemy.dialects.postgresql import insert as pg_insert

from database import SessionLocal
from models import SchoolSeed
from services.circles import compute_acronym


def parse_rows(csv_text: str) -> list[tuple[str, str]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    fieldnames = reader.fieldnames or []
    scorecard_mode = "INSTNM" in fieldnames

    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for row in reader:
        if scorecard_mode:
            # College Scorecard schema: filter closed institutions first
            if (row.get("CURROPER") or "").strip() != "1":
                continue
            name = (row.get("INSTNM") or "").strip()
            state = (row.get("STABBR") or "").strip()[:2]
        else:
            name = (row.get("name") or "").strip()
            state = (row.get("state") or "").strip()[:2]

        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        out.append((name, state))
    return out


def load(path: str) -> int:
    with open(path, encoding="utf-8") as fh:
        rows = parse_rows(fh.read())
    db = SessionLocal()
    try:
        db.query(SchoolSeed).delete()
        # Use INSERT … ON CONFLICT DO NOTHING so that re-running the loader
        # (e.g. after a partial failure) cannot introduce duplicate (name, state)
        # rows even if the preceding DELETE somehow did not clear all rows.
        stmt = pg_insert(SchoolSeed).values([
            {"name": n, "state": s or None, "acronym": compute_acronym(n)}
            for n, s in rows
        ]).on_conflict_do_nothing(constraint="uq_school_seed_name_state")
        db.execute(stmt)
        db.commit()
        return len(rows)
    finally:
        db.close()


if __name__ == "__main__":
    n = load(sys.argv[1] if len(sys.argv) > 1 else "data/us_higher_ed.csv")
    print(f"Loaded {n} schools into school_seed")
