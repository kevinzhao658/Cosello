-- 0007_neighborhood_communities.sql
-- Pre-seed one public Community row per Manhattan neighborhood, owned
-- by the Cosello system user (00000000-0000-0000-0000-000000000001).
-- Each community.neighborhood matches the canonical name for the
-- get_neighborhood_community() lookup in backend/services/neighborhood.py.
-- Idempotent via ON CONFLICT (the unique constraint on invite_code
-- gives us idempotency since invite_code is a per-row prefix derived
-- from the neighborhood name).
--
-- SCHEMA CHANGE: expands invite_code from VARCHAR(20) to VARCHAR(30)
-- because 'NBHD-ROOSEVELT-ISLAND' is 21 characters and would be
-- silently truncated under the original limit. VARCHAR widening in
-- Postgres is safe and does not rewrite the table.

BEGIN;

-- Widen invite_code to accommodate the longest NBHD-* code (21 chars).
ALTER TABLE public.communities
    ALTER COLUMN invite_code TYPE VARCHAR(30);

INSERT INTO public.communities (name, description, neighborhood, pickup_address, zip_code, image, is_public, invite_code, created_by, created_at)
VALUES
  ('Chelsea',             NULL, 'Chelsea',             NULL, NULL, NULL, TRUE, 'NBHD-CHELSEA',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Chinatown',           NULL, 'Chinatown',           NULL, NULL, NULL, TRUE, 'NBHD-CHINATOWN',        '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('East Harlem',         NULL, 'East Harlem',         NULL, NULL, NULL, TRUE, 'NBHD-EAST-HARLEM',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('East Village',        NULL, 'East Village',        NULL, NULL, NULL, TRUE, 'NBHD-EAST-VILLAGE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Financial District',  NULL, 'Financial District',  NULL, NULL, NULL, TRUE, 'NBHD-FIDI',             '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Flatiron',            NULL, 'Flatiron',            NULL, NULL, NULL, TRUE, 'NBHD-FLATIRON',         '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Gramercy',            NULL, 'Gramercy',            NULL, NULL, NULL, TRUE, 'NBHD-GRAMERCY',         '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Greenwich Village',   NULL, 'Greenwich Village',   NULL, NULL, NULL, TRUE, 'NBHD-GREENWICH',        '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Harlem',              NULL, 'Harlem',              NULL, NULL, NULL, TRUE, 'NBHD-HARLEM',           '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Hell''s Kitchen',     NULL, 'Hell''s Kitchen',     NULL, NULL, NULL, TRUE, 'NBHD-HELLS-KITCHEN',    '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Inwood',              NULL, 'Inwood',              NULL, NULL, NULL, TRUE, 'NBHD-INWOOD',           '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Kips Bay',            NULL, 'Kips Bay',            NULL, NULL, NULL, TRUE, 'NBHD-KIPS-BAY',         '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Little Italy',        NULL, 'Little Italy',        NULL, NULL, NULL, TRUE, 'NBHD-LITTLE-ITALY',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Lower East Side',     NULL, 'Lower East Side',     NULL, NULL, NULL, TRUE, 'NBHD-LES',              '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Midtown East',        NULL, 'Midtown East',        NULL, NULL, NULL, TRUE, 'NBHD-MIDTOWN-EAST',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Midtown West',        NULL, 'Midtown West',        NULL, NULL, NULL, TRUE, 'NBHD-MIDTOWN-WEST',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Morningside Heights', NULL, 'Morningside Heights', NULL, NULL, NULL, TRUE, 'NBHD-MORNINGSIDE',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Murray Hill',         NULL, 'Murray Hill',         NULL, NULL, NULL, TRUE, 'NBHD-MURRAY-HILL',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('NoHo',                NULL, 'NoHo',                NULL, NULL, NULL, TRUE, 'NBHD-NOHO',             '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('NoLita',              NULL, 'NoLita',              NULL, NULL, NULL, TRUE, 'NBHD-NOLITA',           '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Roosevelt Island',    NULL, 'Roosevelt Island',    NULL, NULL, NULL, TRUE, 'NBHD-ROOSEVELT-ISLAND', '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('SoHo',                NULL, 'SoHo',                NULL, NULL, NULL, TRUE, 'NBHD-SOHO',             '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Times Square',        NULL, 'Times Square',        NULL, NULL, NULL, TRUE, 'NBHD-TIMES-SQUARE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Tribeca',             NULL, 'Tribeca',             NULL, NULL, NULL, TRUE, 'NBHD-TRIBECA',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Two Bridges',         NULL, 'Two Bridges',         NULL, NULL, NULL, TRUE, 'NBHD-TWO-BRIDGES',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Union Square',        NULL, 'Union Square',        NULL, NULL, NULL, TRUE, 'NBHD-UNION-SQUARE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Upper East Side',     NULL, 'Upper East Side',     NULL, NULL, NULL, TRUE, 'NBHD-UES',              '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Upper West Side',     NULL, 'Upper West Side',     NULL, NULL, NULL, TRUE, 'NBHD-UWS',              '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Washington Heights',  NULL, 'Washington Heights',  NULL, NULL, NULL, TRUE, 'NBHD-WASHINGTON-HTS',   '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('West Village',        NULL, 'West Village',        NULL, NULL, NULL, TRUE, 'NBHD-WEST-VILLAGE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW())
ON CONFLICT (invite_code) DO NOTHING;

-- Auto-join the system user as a member of every neighborhood community
-- it owns. Keeps the FK semantics clean (every community has at least
-- one member). System user filtered out of member-list endpoints in
-- follow-up work.
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
