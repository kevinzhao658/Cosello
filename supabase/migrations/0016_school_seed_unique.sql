-- Prevent duplicate (name, state) rows in school_seed.
-- Idempotent: wrapped in DO block so re-running is safe.
-- Run after deduplication (7 literal-duplicate rows were removed from the live DB
-- before this constraint was applied).

DO $$ BEGIN
  ALTER TABLE public.school_seed
    ADD CONSTRAINT uq_school_seed_name_state UNIQUE (name, state);
EXCEPTION WHEN duplicate_table THEN NULL;
          WHEN duplicate_object THEN NULL;
END $$;
