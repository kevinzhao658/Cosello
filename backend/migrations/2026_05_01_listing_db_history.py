"""
Migration: capture richer listing/order history for downstream pricing analytics.

What this does
--------------
Listings table:
  1. Add `price_cents` (INTEGER, nullable initially).
  2. Backfill `price_cents` from the existing `price` (TEXT) column. Strip
     whitespace + leading "$". Accept `\\d+` and `\\d+\\.\\d+` only. Round to
     nearest cent. Anything else stays NULL and is reported as an offending row.
  3. If any rows still have NULL price_cents after backfill, halt loudly (no
     commit). Caller fixes those rows manually and re-runs.
  4. Drop the legacy `price` (TEXT) column.
  5. Switch `price_cents` to NOT NULL via SQLite table rebuild.
  6. Add `condition_score` INTEGER, `product_year` INTEGER,
     `identifier_confidence` TEXT — all nullable.
  7. Add `relist_count` INTEGER NOT NULL DEFAULT 0.
  8. Add `original_posted_at` REAL nullable, then backfill = `posted_at`
     where NULL.
  9. Create indexes on `category` and `posted_at`.

Purchase orders table:
  1. Add `list_cycle` INTEGER NOT NULL DEFAULT 0.
  2. Add `confirmed_at` DATETIME nullable + index.
  3. Add `completed_at` DATETIME nullable + index.
  4. Add `listing_price_cents` INTEGER nullable.

Idempotency
-----------
- All ADD COLUMN ops are guarded by an existence check.
- DROP COLUMN ops are guarded by an existence check.
- Backfills are no-ops on rows that have already been migrated (price_cents
  populated, original_posted_at populated).
- CREATE INDEX uses IF NOT EXISTS.
- The "switch price_cents to NOT NULL" rebuild is skipped on re-run (detected
  via PRAGMA table_info "notnull" flag).

Run
---
    python backend/migrations/2026_05_01_listing_db_history.py

Operates on backend/cosello.db (path resolved relative to this file).
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "cosello.db"

_PRICE_RE = re.compile(r"^\d+(\.\d+)?$")


def _columns(conn: sqlite3.Connection, table: str) -> dict[str, sqlite3.Row]:
    """Return {col_name: row} where row is the PRAGMA table_info row."""
    cur = conn.execute(f"PRAGMA table_info({table})")
    return {row[1]: row for row in cur.fetchall()}


def _add_column_if_missing(
    conn: sqlite3.Connection,
    table: str,
    col_name: str,
    col_decl: str,
) -> bool:
    if col_name in _columns(conn, table):
        print(f"  - column `{table}.{col_name}` already exists, skipping ADD", file=sys.stderr)
        return False
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_decl}")
    print(f"  - added column `{table}.{col_name}` ({col_decl})", file=sys.stderr)
    return True


def _drop_column_if_present(
    conn: sqlite3.Connection, table: str, col_name: str
) -> bool:
    if col_name not in _columns(conn, table):
        print(f"  - column `{table}.{col_name}` not present, skipping DROP", file=sys.stderr)
        return False
    conn.execute(f"ALTER TABLE {table} DROP COLUMN {col_name}")
    print(f"  - dropped column `{table}.{col_name}`", file=sys.stderr)
    return True


def _create_index_if_missing(
    conn: sqlite3.Connection, idx_name: str, table: str, col: str
) -> None:
    conn.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({col})")
    print(f"  - ensured index `{idx_name}` on `{table}({col})`", file=sys.stderr)


def _parse_price_to_cents(raw: object) -> int | None:
    """Return cents (int) or None if `raw` is not a clean numeric string."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s.startswith("$"):
        s = s[1:].strip()
    if not s:
        return None
    if not _PRICE_RE.match(s):
        return None
    try:
        return int(round(float(s) * 100))
    except (ValueError, OverflowError):
        return None


def _migrate_listings(conn: sqlite3.Connection) -> None:
    print("[migrate] listings: step 1 — add price_cents nullable", file=sys.stderr)
    _add_column_if_missing(conn, "listings", "price_cents", "INTEGER")
    conn.commit()

    cols = _columns(conn, "listings")
    has_price = "price" in cols

    print("[migrate] listings: step 2 — backfill price_cents from price", file=sys.stderr)
    offenders: list[tuple[str, object]] = []
    if has_price:
        rows = conn.execute(
            "SELECT id, price, price_cents FROM listings"
        ).fetchall()
        backfilled = 0
        for row in rows:
            row_id, raw_price, current_pc = row[0], row[1], row[2]
            if current_pc is not None:
                continue  # already migrated
            cents = _parse_price_to_cents(raw_price)
            if cents is None:
                offenders.append((row_id, raw_price))
                continue
            conn.execute(
                "UPDATE listings SET price_cents = ? WHERE id = ?",
                (cents, row_id),
            )
            backfilled += 1
        print(
            f"  - backfilled {backfilled}/{len(rows)} listings",
            file=sys.stderr,
        )
    else:
        print(
            "  - no `price` column present; assuming already migrated",
            file=sys.stderr,
        )

    print("[migrate] listings: step 3 — verify price_cents NULL count", file=sys.stderr)
    null_count = conn.execute(
        "SELECT COUNT(*) FROM listings WHERE price_cents IS NULL"
    ).fetchone()[0]
    if null_count > 0:
        sample = conn.execute(
            "SELECT id, price FROM listings WHERE price_cents IS NULL LIMIT 50"
            if has_price
            else "SELECT id FROM listings WHERE price_cents IS NULL LIMIT 50"
        ).fetchall()
        print(
            f"\n[migrate] HALT: {null_count} listing row(s) still have NULL price_cents.",
            file=sys.stderr,
        )
        print("[migrate] Offending rows (id, raw price):", file=sys.stderr)
        if has_price:
            for r in sample:
                print(f"  - id={r[0]!r}  price={r[1]!r}", file=sys.stderr)
        else:
            for r in sample:
                print(f"  - id={r[0]!r}", file=sys.stderr)
        if offenders and len(offenders) > len(sample):
            print(
                f"  ... ({len(offenders) - len(sample)} more offenders not shown)",
                file=sys.stderr,
            )
        conn.rollback()
        raise SystemExit(
            "Migration aborted: fix or remove the listings above, then re-run."
        )

    conn.commit()

    print("[migrate] listings: step 4 — drop legacy `price` column", file=sys.stderr)
    if has_price:
        _drop_column_if_present(conn, "listings", "price")
        conn.commit()

    print(
        "[migrate] listings: step 5 — ensure price_cents is NOT NULL",
        file=sys.stderr,
    )
    cols = _columns(conn, "listings")
    pc_row = cols.get("price_cents")
    # PRAGMA table_info row layout: (cid, name, type, notnull, dflt_value, pk)
    if pc_row is not None and pc_row[3] == 0:
        # SQLite cannot ALTER COLUMN ... SET NOT NULL directly. Rebuild via the
        # standard 12-step pattern condensed for this single-column change.
        print(
            "  - rebuilding listings table to enforce NOT NULL on price_cents",
            file=sys.stderr,
        )
        _rebuild_listings_with_notnull_price_cents(conn)
        conn.commit()
    else:
        print("  - price_cents already NOT NULL, skipping rebuild", file=sys.stderr)

    print(
        "[migrate] listings: step 6 — add condition_score / product_year / "
        "identifier_confidence / relist_count / original_posted_at",
        file=sys.stderr,
    )
    _add_column_if_missing(conn, "listings", "condition_score", "INTEGER")
    _add_column_if_missing(conn, "listings", "product_year", "INTEGER")
    _add_column_if_missing(conn, "listings", "identifier_confidence", "TEXT")
    _add_column_if_missing(conn, "listings", "relist_count", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing(conn, "listings", "original_posted_at", "REAL")
    conn.commit()

    print(
        "[migrate] listings: step 7 — backfill original_posted_at from posted_at",
        file=sys.stderr,
    )
    cur = conn.execute(
        "UPDATE listings SET original_posted_at = posted_at "
        "WHERE original_posted_at IS NULL"
    )
    print(f"  - backfilled {cur.rowcount} row(s)", file=sys.stderr)
    conn.commit()

    print("[migrate] listings: step 8 — indexes", file=sys.stderr)
    _create_index_if_missing(conn, "ix_listings_category", "listings", "category")
    _create_index_if_missing(conn, "ix_listings_posted_at", "listings", "posted_at")
    conn.commit()


def _rebuild_listings_with_notnull_price_cents(conn: sqlite3.Connection) -> None:
    """Rebuild `listings` to enforce NOT NULL on price_cents.

    Preserves all other columns and data verbatim. Run inside a transaction;
    callers commit after this returns.
    """
    cols = _columns(conn, "listings")

    # Build column declarations matching the live schema, swapping price_cents
    # to NOT NULL. We deliberately use the same TEXT/INTEGER/REAL types we
    # observe via PRAGMA so we don't accidentally widen or narrow anything.
    col_defs: list[str] = []
    col_names: list[str] = []
    for name, row in cols.items():
        # row: (cid, name, type, notnull, dflt_value, pk)
        col_type = row[2] or ""
        notnull = row[3]
        dflt = row[4]
        is_pk = row[5]
        parts = [name, col_type]
        if name == "price_cents":
            parts.append("NOT NULL")
        elif notnull:
            parts.append("NOT NULL")
        if dflt is not None:
            parts.append(f"DEFAULT {dflt}")
        if is_pk:
            parts.append("PRIMARY KEY")
        col_defs.append(" ".join(p for p in parts if p))
        col_names.append(name)

    new_table = "listings__rebuild"
    conn.execute(f"DROP TABLE IF EXISTS {new_table}")
    conn.execute(f"CREATE TABLE {new_table} ({', '.join(col_defs)})")
    cols_csv = ", ".join(col_names)
    conn.execute(
        f"INSERT INTO {new_table} ({cols_csv}) SELECT {cols_csv} FROM listings"
    )
    conn.execute("DROP TABLE listings")
    conn.execute(f"ALTER TABLE {new_table} RENAME TO listings")
    # Recreate the canonical indexes — the rebuild drops them.
    conn.execute("CREATE INDEX IF NOT EXISTS ix_listings_id ON listings(id)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_listings_user_id ON listings(user_id)")


def _migrate_purchase_orders(conn: sqlite3.Connection) -> None:
    print(
        "[migrate] purchase_orders: add list_cycle / confirmed_at / completed_at / "
        "listing_price_cents",
        file=sys.stderr,
    )
    _add_column_if_missing(
        conn, "purchase_orders", "list_cycle", "INTEGER NOT NULL DEFAULT 0"
    )
    _add_column_if_missing(conn, "purchase_orders", "confirmed_at", "DATETIME")
    _add_column_if_missing(conn, "purchase_orders", "completed_at", "DATETIME")
    _add_column_if_missing(
        conn, "purchase_orders", "listing_price_cents", "INTEGER"
    )
    conn.commit()

    print("[migrate] purchase_orders: indexes", file=sys.stderr)
    _create_index_if_missing(
        conn, "ix_purchase_orders_confirmed_at", "purchase_orders", "confirmed_at"
    )
    _create_index_if_missing(
        conn, "ix_purchase_orders_completed_at", "purchase_orders", "completed_at"
    )
    conn.commit()


def migrate(db_path: Path = DB_PATH) -> None:
    print(f"[migrate] opening {db_path}", file=sys.stderr)
    if not db_path.exists():
        print(
            f"[migrate] WARNING: db file does not exist at {db_path}; "
            f"sqlite3 will create an empty one",
            file=sys.stderr,
        )

    conn = sqlite3.connect(str(db_path))
    try:
        # Sanity: required tables must exist.
        existing_tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "listings" not in existing_tables:
            print(
                "[migrate] no `listings` table found; nothing to do.",
                file=sys.stderr,
            )
            return

        _migrate_listings(conn)

        if "purchase_orders" in existing_tables:
            _migrate_purchase_orders(conn)
        else:
            print(
                "[migrate] purchase_orders table missing; skipping order migrations",
                file=sys.stderr,
            )

        print("[migrate] verification — first 3 listings", file=sys.stderr)
        verify = conn.execute(
            "SELECT id, brand, name, price_cents, relist_count, original_posted_at "
            "FROM listings LIMIT 3"
        ).fetchall()
        if not verify:
            print("  (table is empty)", file=sys.stderr)
        for row in verify:
            print(
                f"  id={row[0]!r}  brand={row[1]!r}  name={row[2]!r}  "
                f"price_cents={row[3]!r}  relist_count={row[4]!r}  "
                f"original_posted_at={row[5]!r}",
                file=sys.stderr,
            )

        print("[migrate] done.", file=sys.stderr)
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
