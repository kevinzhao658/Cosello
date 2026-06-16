-- Circles Phase 1: type communities, add per-membership consent, add a
-- user-level mutual-friends consent flag, and a school seed reference table.
-- Backward compatible: existing communities default to kind='interest';
-- existing memberships default share_with_mutuals=false (opt-in).

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'interest',
  ADD COLUMN IF NOT EXISTS school_seed_id INTEGER;

-- Existing neighborhood communities (created by services/neighborhood.py) are
-- retyped so Phase 2 can tell them apart from interest communities.
UPDATE public.communities
  SET kind = 'neighborhood'
  WHERE neighborhood IS NOT NULL AND name = neighborhood;

ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS share_with_mutuals BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS share_mutual_friends BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.school_seed (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  state       VARCHAR(2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram-style prefix search support for the autocomplete.
CREATE INDEX IF NOT EXISTS idx_school_seed_name_lower
  ON public.school_seed (lower(name));

-- Link a school-kind community back to the seed row it was created from.
ALTER TABLE public.communities
  ADD CONSTRAINT fk_communities_school_seed
  FOREIGN KEY (school_seed_id) REFERENCES public.school_seed(id)
  ON DELETE SET NULL;
