-- 0006_system_user.sql
-- Insert the Cosello system user. Owns all auto-created neighborhood
-- communities via the created_by FK. Idempotent via ON CONFLICT.
--
-- NOTE: public.users.id has a FK to auth.users.id (set in 0001_initial_schema.sql).
-- We insert into auth.users first so the FK is satisfied. The
-- on_auth_user_created trigger (0002_users_trigger.sql) auto-inserts the
-- public.users row; we then UPDATE to set display_name. Using ON CONFLICT on
-- both inserts makes this migration fully idempotent.

BEGIN;

-- 1. Seed the auth.users row so the FK is satisfied.
--    This is a minimal row — no email, no phone, no encrypted_password,
--    so the system user cannot authenticate via any Supabase Auth flow.
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  NULL,
  '',
  NOW(),
  NOW(),
  '{"provider":"system","providers":["system"]}'::jsonb,
  '{}'::jsonb,
  FALSE,
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- 2. The trigger auto-creates public.users(id) on auth.users insert.
--    Patch display_name now that the row exists.
UPDATE public.users
SET display_name = 'Cosello'
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

COMMIT;
