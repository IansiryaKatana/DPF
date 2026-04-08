-- Allow anonymous visitors to read the public Enterprise pricing badge text
-- (marketing page is viewed without auth). Scoped to this key only.
DROP POLICY IF EXISTS "Anonymous can read enterprise pricing badge" ON public.admin_settings;

CREATE POLICY "Anonymous can read enterprise pricing badge"
ON public.admin_settings
FOR SELECT
TO anon
USING (
  is_encrypted = false
  AND setting_key = 'enterprise_pricing_badge'
);
