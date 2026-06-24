-- Migration 0019: composite index on listings (status, posted_at)
--
-- The marketplace feed endpoints filter every request with:
--   WHERE status != 'sold' AND posted_at >= <cutoff>
--   ORDER BY posted_at DESC
--
-- A composite btree index on (status, posted_at) lets Postgres:
--   1. Use an index scan over the 'open' and other non-'sold' values,
--   2. Satisfy the posted_at range bound within that scan,
--   3. Return rows already ordered for the DESC sort without a separate sort step.
--
-- The standalone posted_at index that already exists (from the ORM index=True)
-- cannot filter on status; the composite supersedes it for these queries.

CREATE INDEX IF NOT EXISTS ix_listings_status_posted_at
    ON listings (status, posted_at);
