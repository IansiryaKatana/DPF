-- Fix demo_requests select policy to avoid querying auth.users directly.
-- The previous policy referenced auth.users, which can trigger:
--   42501 permission denied for table users
-- when evaluating RLS for non-service-role sessions.

DROP POLICY IF EXISTS "Users can view own demo request" ON public.demo_requests;

CREATE POLICY "Users can view own demo request"
ON public.demo_requests
FOR SELECT
TO authenticated
USING (
  lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
);

