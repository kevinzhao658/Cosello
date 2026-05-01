"""
Migration: unify brand & name as top-level columns on `listings`.

What this does
--------------
1. Adds `brand` (TEXT, nullable) and `name` (TEXT, nullable) columns to `listings`
   if they do not already exist.
2. Backfills `brand` from `category_attributes` JSON's `brand` key (if present
   and non-empty).
3. Backfills `name` from the existing `title`:
   - If `brand` is non-empty AND `title` (case-insensitive) starts with
     `brand + " "`, then `name = title[len(brand)+1:].strip()`.
   - Otherwise, `name = title` (the whole title becomes the name).
4. Strips `model` and `brand` keys from every row's `category_attributes` JSON
   and re-serializes.
5. Drops the `title` column from `listings` (SQLite >= 3.35 supports
   DROP COLUMN; project uses 3.50+).
6. Verification: prints the first 3 rows' brand/name/category_attributes to
   stderr for sanity-checking.

Idempotency
-----------
- ADD COLUMN guarded by a column-existence check.
- DROP COLUMN guarded by a column-existence check.
- Backfill skips rows where `name` is already populated (treat as already
  migrated). `brand` may be re-derived from JSON safely because the JSON
  scrub removes the source key on first run; subsequent runs find no
  `brand` key in JSON and leave the column unchanged.
- JSON scrub is a no-op on rows that have already had `model`/`brand`
  stripped.

Run
---
    python backend/migrations/2026_04_30_unify_brand_name.py

Operates on backend/cosello.db (path resolved relative to this file).
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "cosello.db"


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cur.fetchall()}


def _add_column_if_missing(
    conn: sqlite3.Connection, table: str, col_name: str, col_type: str
) -> bool:
    if col_name in _columns(conn, table):
        print(f"  - column `{col_name}` already exists, skipping ADD", file=sys.stderr)
        return False
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
    print(f"  - added column `{col_name}` ({col_type})", file=sys.stderr)
    return True


def _drop_column_if_present(
    conn: sqlite3.Connection, table: str, col_name: str
) -> bool:
    if col_name not in _columns(conn, table):
        print(f"  - column `{col_name}` not present, skipping DROP", file=sys.stderr)
        return False
    conn.execute(f"ALTER TABLE {table} DROP COLUMN {col_name}")
    print(f"  - dropped column `{col_name}`", file=sys.stderr)
    return True


def _split_title(title: str | None, brand: str | None) -> str:
    """Derive `name` from `title` and (already-resolved) `brand`."""
    t = (title or "").strip()
    if not t:
        return ""
    b = (brand or "").strip()
    if b and t.lower().startswith(b.lower() + " "):
        return t[len(b) + 1 :].strip()
    return t


def migrate(db_path: Path = DB_PATH) -> None:
    print(f"[migrate] opening {db_path}", file=sys.stderr)
    if not db_path.exists():
        print(
            f"[migrate] WARNING: db file does not exist at {db_path}; "
            f"sqlite3 will create an empty one",
            file=sys.stderr,
        )

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        # Sanity: listings table must exist.
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='listings'"
        )
        if cur.fetchone() is None:
            print(
                "[migrate] no `listings` table found; nothing to do.",
                file=sys.stderr,
            )
            return

        print("[migrate] step 1/4: add brand & name columns", file=sys.stderr)
        _add_column_if_missing(conn, "listings", "brand", "TEXT")
        _add_column_if_missing(conn, "listings", "name", "TEXT")
        conn.commit()

        cols_now = _columns(conn, "listings")
        has_title = "title" in cols_now

        print(
            "[migrate] step 2/4: backfill brand & name + scrub JSON keys",
            file=sys.stderr,
        )
        # Pull all rows. We need title (if still present), category_attributes,
        # current brand & name (to support idempotent re-runs).
        select_cols = ["id", "category_attributes", "brand", "name"]
        if has_title:
            select_cols.insert(1, "title")
        rows = conn.execute(
            f"SELECT {', '.join(select_cols)} FROM listings"
        ).fetchall()

        updated = 0
        for row in rows:
            row_id = row["id"]
            existing_brand = row["brand"]
            existing_name = row["name"]
            ca_raw = row["category_attributes"]
            title = row["title"] if has_title else None

            # Parse category_attributes JSON (be defensive — could be None or
            # invalid JSON in pathological cases).
            attrs: dict = {}
            if ca_raw:
                try:
                    parsed = json.loads(ca_raw)
                    if isinstance(parsed, dict):
                        attrs = parsed
                except (ValueError, TypeError):
                    print(
                        f"  ! row {row_id}: category_attributes is not valid JSON; "
                        f"leaving as-is",
                        file=sys.stderr,
                    )
                    attrs = {}

            # Derive brand: prefer existing column value if non-empty,
            # else pull from JSON.
            new_brand = existing_brand
            if not (new_brand and str(new_brand).strip()):
                json_brand = attrs.get("brand") if isinstance(attrs, dict) else None
                if isinstance(json_brand, str) and json_brand.strip():
                    new_brand = json_brand.strip()
                else:
                    new_brand = None

            # Derive name: prefer existing column value if non-empty,
            # else split from title.
            new_name = existing_name
            if not (new_name and str(new_name).strip()):
                new_name = _split_title(title, new_brand) or None

            # Scrub `model` and `brand` keys from JSON.
            scrubbed = False
            if isinstance(attrs, dict):
                if "model" in attrs:
                    attrs.pop("model", None)
                    scrubbed = True
                if "brand" in attrs:
                    attrs.pop("brand", None)
                    scrubbed = True

            new_ca_raw = ca_raw
            if scrubbed or (ca_raw and not isinstance(attrs, dict)):
                new_ca_raw = json.dumps(attrs) if attrs else json.dumps({})

            # Only write if something changed.
            if (
                new_brand != existing_brand
                or new_name != existing_name
                or new_ca_raw != ca_raw
            ):
                conn.execute(
                    "UPDATE listings SET brand = ?, name = ?, "
                    "category_attributes = ? WHERE id = ?",
                    (new_brand, new_name, new_ca_raw, row_id),
                )
                updated += 1

        conn.commit()
        print(
            f"  - updated {updated}/{len(rows)} row(s)",
            file=sys.stderr,
        )

        print("[migrate] step 3/4: drop `title` column", file=sys.stderr)
        _drop_column_if_present(conn, "listings", "title")
        conn.commit()

        print("[migrate] step 4/4: verification — first 3 rows", file=sys.stderr)
        verify = conn.execute(
            "SELECT id, brand, name, category_attributes FROM listings LIMIT 3"
        ).fetchall()
        if not verify:
            print("  (table is empty)", file=sys.stderr)
        for row in verify:
            print(
                f"  id={row['id']!r}  brand={row['brand']!r}  "
                f"name={row['name']!r}  category_attributes={row['category_attributes']!r}",
                file=sys.stderr,
            )

        print("[migrate] done.", file=sys.stderr)
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
