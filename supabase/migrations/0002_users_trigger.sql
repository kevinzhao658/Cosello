-- Auto-create public.users row when a new auth.users entry is inserted.
--
-- Without this, /api/auth/me returns 401 for newly signed-up users (the JWT
-- validates, but no public.users row exists yet), and the frontend can never
-- reach /api/auth/register to fill in display_name + neighborhood.
--
-- SECURITY DEFINER lets the trigger insert into public.users regardless of the
-- calling role's RLS posture. search_path is locked to prevent injection.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
