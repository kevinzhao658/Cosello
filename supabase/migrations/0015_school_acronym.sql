-- Add acronym column to school_seed for abbreviation-based search (e.g. NYU -> New York University).
-- Idempotent: safe to re-run.

ALTER TABLE public.school_seed
  ADD COLUMN IF NOT EXISTS acronym VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_school_seed_acronym
  ON public.school_seed (acronym);
