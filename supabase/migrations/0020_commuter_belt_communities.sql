-- 0020_commuter_belt_communities.sql
-- Pre-seed one public Community row per Queens/Brooklyn commuter-belt
-- neighborhood, owned by the Cosello system user
-- (00000000-0000-0000-0000-000000000001). Idempotent via
-- ON CONFLICT (invite_code) DO NOTHING.

BEGIN;

INSERT INTO public.communities (name, description, neighborhood, pickup_address, zip_code, image, is_public, invite_code, created_by, created_at)
VALUES
  ('Long Island City',          NULL, 'Long Island City',          NULL, NULL, NULL, TRUE, 'NBHD-LIC',               '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Astoria',                   NULL, 'Astoria',                   NULL, NULL, NULL, TRUE, 'NBHD-ASTORIA',           '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Sunnyside',                 NULL, 'Sunnyside',                 NULL, NULL, NULL, TRUE, 'NBHD-SUNNYSIDE',         '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Woodside',                  NULL, 'Woodside',                  NULL, NULL, NULL, TRUE, 'NBHD-WOODSIDE',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Jackson Heights',           NULL, 'Jackson Heights',           NULL, NULL, NULL, TRUE, 'NBHD-JACKSON-HEIGHTS',   '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Forest Hills',              NULL, 'Forest Hills',              NULL, NULL, NULL, TRUE, 'NBHD-FOREST-HILLS',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Greenpoint',                NULL, 'Greenpoint',                NULL, NULL, NULL, TRUE, 'NBHD-GREENPOINT',        '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Williamsburg',              NULL, 'Williamsburg',              NULL, NULL, NULL, TRUE, 'NBHD-WILLIAMSBURG',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Bushwick',                  NULL, 'Bushwick',                  NULL, NULL, NULL, TRUE, 'NBHD-BUSHWICK',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Bedford-Stuyvesant',        NULL, 'Bedford-Stuyvesant',        NULL, NULL, NULL, TRUE, 'NBHD-BED-STUY',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Clinton Hill',              NULL, 'Clinton Hill',              NULL, NULL, NULL, TRUE, 'NBHD-CLINTON-HILL',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('DUMBO',                     NULL, 'DUMBO',                     NULL, NULL, NULL, TRUE, 'NBHD-DUMBO',             '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Boerum Hill',               NULL, 'Boerum Hill',               NULL, NULL, NULL, TRUE, 'NBHD-BOERUM-HILL',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Prospect Heights',          NULL, 'Prospect Heights',          NULL, NULL, NULL, TRUE, 'NBHD-PROSPECT-HEIGHTS',  '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Park Slope',                NULL, 'Park Slope',                NULL, NULL, NULL, TRUE, 'NBHD-PARK-SLOPE',        '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Carroll Gardens',           NULL, 'Carroll Gardens',           NULL, NULL, NULL, TRUE, 'NBHD-CARROLL-GARDENS',   '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Crown Heights',             NULL, 'Crown Heights',             NULL, NULL, NULL, TRUE, 'NBHD-CROWN-HEIGHTS',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Prospect-Lefferts Gardens', NULL, 'Prospect-Lefferts Gardens', NULL, NULL, NULL, TRUE, 'NBHD-PLG',               '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Flatbush',                  NULL, 'Flatbush',                  NULL, NULL, NULL, TRUE, 'NBHD-FLATBUSH',          '00000000-0000-0000-0000-000000000001'::uuid, NOW())
ON CONFLICT (invite_code) DO NOTHING;

-- Auto-join the system user to every system-owned community (mirrors 0007/0008).
INSERT INTO public.community_members (community_id, user_id, role, joined_at)
SELECT c.id, '00000000-0000-0000-0000-000000000001'::uuid, 'owner', NOW()
FROM public.communities c
WHERE c.created_by = '00000000-0000-0000-0000-000000000001'::uuid
ON CONFLICT (community_id, user_id) DO NOTHING;

COMMIT;
