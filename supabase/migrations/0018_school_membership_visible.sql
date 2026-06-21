-- Existing school memberships should be visible on listings by default
-- (school becomes always-on per the 2026-06-20 insights redesign).
-- Idempotent: safe to re-run.
UPDATE public.community_members AS cm
   SET share_with_mutuals = TRUE
  FROM public.communities AS c
 WHERE c.id = cm.community_id
   AND c.kind = 'school'
   AND cm.share_with_mutuals IS DISTINCT FROM TRUE;
