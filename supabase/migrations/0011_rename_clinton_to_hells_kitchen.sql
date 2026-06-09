-- 0011_rename_clinton_to_hells_kitchen.sql
-- Rename the canonical neighborhood "Clinton (Hell's Kitchen)" -> "Hell's Kitchen".
-- Renames the pre-seeded community row (name/neighborhood/invite_code) in place,
-- preserving its id + all community_members rows, and migrates existing residents'
-- user.neighborhood so they stay matched to the renamed community.
-- Idempotent: the WHERE clauses match nothing on a second run.

BEGIN;

UPDATE public.communities
SET name = 'Hell''s Kitchen',
    neighborhood = 'Hell''s Kitchen',
    invite_code = 'NBHD-HELLS-KITCHEN'
WHERE invite_code = 'NBHD-CLINTON';

UPDATE public.users
SET neighborhood = 'Hell''s Kitchen'
WHERE neighborhood = 'Clinton (Hell''s Kitchen)';

COMMIT;
