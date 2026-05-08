"""
Migration: add behavioral event tables for the FYP ranker.

What this does
--------------
Creates three tables (idempotent — uses CREATE TABLE IF NOT EXISTS) plus
indexes:

  - listing_views(id, user_id, listing_id, source, dwell_ms, ts)
  - search_queries(id, user_id, query_text, filters_json, ts)
  - listing_interactions(id, user_id, listing_id, action, ts)
      UNIQUE(user_id, listing_id, action)

All `ts` columns are REAL (Unix epoch seconds) — matches `listings.posted_at`.
The `listings.id` column is TEXT (not INTEGER) so the foreign key columns are
TEXT to align.

Run
---
    python backend/migrations/2026_05_02_fyp_instrumentation.py

Operates on backend/cosello.db (path resolved relative to this file).
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "cosello.db"


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return row is not None


def _create_index_if_missing(
    conn: sqlite3.Connection, idx_name: str, table: str, col: str
) -> None:
    conn.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({col})")
    print(f"  - ensured index `{idx_name}` on `{table}({col})`", file=sys.stderr)


def _create_listing_views(conn: sqlite3.Connection) -> None:
    print("[migrate] listing_views: create table + indexes", file=sys.stderr)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS listing_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            listing_id TEXT NOT NULL REFERENCES listings(id),
            source TEXT NOT NULL,
            dwell_ms INTEGER NOT NULL DEFAULT 0,
            ts REAL NOT NULL
        )
        """
    )
    _create_index_if_missing(conn, "ix_listing_views_user_id", "listing_views", "user_id")
    _create_index_if_missing(conn, "ix_listing_views_listing_id", "listing_views", "listing_id")
    _create_index_if_missing(conn, "ix_listing_views_ts", "listing_views", "ts")
    conn.commit()


def _create_search_queries(conn: sqlite3.Connection) -> None:
    print("[migrate] search_queries: create table + indexes", file=sys.stderr)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS search_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            query_text TEXT NOT NULL,
            filters_json TEXT,
            ts REAL NOT NULL
        )
        """
    )
    _create_index_if_missing(conn, "ix_search_queries_user_id", "search_queries", "user_id")
    _create_index_if_missing(conn, "ix_search_queries_ts", "search_queries", "ts")
    conn.commit()


def _create_listing_interactions(conn: sqlite3.Connection) -> None:
    print("[migrate] listing_interactions: create table + indexes", file=sys.stderr)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS listing_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            listing_id TEXT NOT NULL REFERENCES listings(id),
            action TEXT NOT NULL,
            ts REAL NOT NULL,
            CONSTRAINT uq_listing_interaction UNIQUE (user_id, listing_id, action)
        )
        """
    )
    _create_index_if_missing(
        conn, "ix_listing_interactions_user_id", "listing_interactions", "user_id"
    )
    _create_index_if_missing(
        conn, "ix_listing_interactions_listing_id", "listing_interactions", "listing_id"
    )
    _create_index_if_missing(
        conn, "ix_listing_interactions_ts", "listing_interactions", "ts"
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
        existing_tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        # Sanity: parent tables must exist before we add FK references to them.
        for required in ("users", "listings"):
            if required not in existing_tables:
                print(
                    f"[migrate] HALT: required parent table `{required}` is missing.",
                    file=sys.stderr,
                )
                raise SystemExit(
                    f"Migration aborted: `{required}` table not found in {db_path}."
                )

        _create_listing_views(conn)
        _create_search_queries(conn)
        _create_listing_interactions(conn)

        print("[migrate] verification — table presence", file=sys.stderr)
        for t in ("listing_views", "search_queries", "listing_interactions"):
            ok = _table_exists(conn, t)
            print(f"  - {t}: {'OK' if ok else 'MISSING'}", file=sys.stderr)
            if not ok:
                raise SystemExit(f"Migration failed: `{t}` not created.")

        print("[migrate] done.", file=sys.stderr)
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
