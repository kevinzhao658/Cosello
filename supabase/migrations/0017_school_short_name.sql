-- Add a compact display name for schools shown on listing cards.
-- short_name = curated override ?? computed acronym ?? full name (populated by
-- backend/scripts/backfill_school_short_names.py). Idempotent.

DO $$ BEGIN
  ALTER TABLE public.school_seed ADD COLUMN short_name VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
