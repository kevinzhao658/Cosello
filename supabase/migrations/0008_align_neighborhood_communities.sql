-- 0008_align_neighborhood_communities.sql
-- Align BE neighborhood communities to the FE-canonical list.
-- - UPDATE 5 renamed communities (Hell's Kitchen → Clinton (Hell's Kitchen), etc.)
-- - DELETE 1 BE-only community (Union Square) — no real members exist
-- - INSERT 14 missing communities
-- Idempotent: re-running this migration after it lands is a no-op.

BEGIN;

-- Step 1: UPDATE the 5 renamed communities (keep their id + member rows).
UPDATE public.communities
SET name = 'Clinton (Hell''s Kitchen)', neighborhood = 'Clinton (Hell''s Kitchen)', invite_code = 'NBHD-CLINTON'
WHERE invite_code = 'NBHD-HELLS-KITCHEN';

UPDATE public.communities
SET name = 'Flatiron District', neighborhood = 'Flatiron District', invite_code = 'NBHD-FLATIRON-DISTRICT'
WHERE invite_code = 'NBHD-FLATIRON';

UPDATE public.communities
SET name = 'Gramercy Park', neighborhood = 'Gramercy Park', invite_code = 'NBHD-GRAMERCY-PARK'
WHERE invite_code = 'NBHD-GRAMERCY';

UPDATE public.communities
SET name = 'Nolita', neighborhood = 'Nolita', invite_code = 'NBHD-NOLITA-V2'
WHERE invite_code = 'NBHD-NOLITA';

UPDATE public.communities
SET name = 'Theater District', neighborhood = 'Theater District', invite_code = 'NBHD-THEATER-DISTRICT'
WHERE invite_code = 'NBHD-TIMES-SQUARE';

-- Step 2: DELETE the BE-only Union Square community (members table cascades via FK? Verify.
-- If no cascade, delete community_members rows first.)
DELETE FROM public.community_members
WHERE community_id IN (
    SELECT id FROM public.communities WHERE invite_code = 'NBHD-UNION-SQUARE'
);
DELETE FROM public.communities WHERE invite_code = 'NBHD-UNION-SQUARE';

-- Step 3: INSERT the 14 missing FE-canonical communities.
INSERT INTO public.communities (name, description, neighborhood, pickup_address, zip_code, image, is_public, invite_code, created_by, created_at)
VALUES
  ('Battery Park City',  NULL, 'Battery Park City',  NULL, NULL, NULL, TRUE, 'NBHD-BATTERY-PARK',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Carnegie Hill',      NULL, 'Carnegie Hill',      NULL, NULL, NULL, TRUE, 'NBHD-CARNEGIE-HILL',    '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Civic Center',       NULL, 'Civic Center',       NULL, NULL, NULL, TRUE, 'NBHD-CIVIC-CENTER',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Hamilton Heights',   NULL, 'Hamilton Heights',   NULL, NULL, NULL, TRUE, 'NBHD-HAMILTON-HTS',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Hudson Heights',     NULL, 'Hudson Heights',     NULL, NULL, NULL, TRUE, 'NBHD-HUDSON-HTS',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Lenox Hill',         NULL, 'Lenox Hill',         NULL, NULL, NULL, TRUE, 'NBHD-LENOX-HILL',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Lincoln Square',     NULL, 'Lincoln Square',     NULL, NULL, NULL, TRUE, 'NBHD-LINCOLN-SQUARE',   '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Marble Hill',        NULL, 'Marble Hill',        NULL, NULL, NULL, TRUE, 'NBHD-MARBLE-HILL',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('NoMad',              NULL, 'NoMad',              NULL, NULL, NULL, TRUE, 'NBHD-NOMAD',            '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Stuyvesant Town',    NULL, 'Stuyvesant Town',    NULL, NULL, NULL, TRUE, 'NBHD-STUYVESANT-TOWN',  '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Sutton Place',       NULL, 'Sutton Place',       NULL, NULL, NULL, TRUE, 'NBHD-SUTTON-PLACE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Tudor City',         NULL, 'Tudor City',         NULL, NULL, NULL, TRUE, 'NBHD-TUDOR-CITY',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Turtle Bay',         NULL, 'Turtle Bay',         NULL, NULL, NULL, TRUE, 'NBHD-TURTLE-BAY',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Yorkville',          NULL, 'Yorkville',          NULL, NULL, NULL, TRUE, 'NBHD-YORKVILLE',        '00000000-0000-0000-0000-000000000001'::uuid, NOW())
ON CONFLICT (invite_code) DO NOTHING;

-- Step 4: Auto-join system user to the 14 new communities (mirror 0007's pattern).
INSERT INTO public.community_members (community_id, user_id, role, joined_at)
SELECT
  c.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'owner',
  NOW()
FROM public.communities c
WHERE c.created_by = '00000000-0000-0000-0000-000000000001'::uuid
ON CONFLICT (community_id, user_id) DO NOTHING;

COMMIT;
