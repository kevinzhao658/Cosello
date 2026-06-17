-- Optional self-reported pronouns captured at registration.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pronouns VARCHAR(40);
