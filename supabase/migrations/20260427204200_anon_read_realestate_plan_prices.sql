-- Allow anonymous visitors on public Real Estate landing page
-- to read non-encrypted plan pricing settings.
DROP POLICY IF EXISTS "Anonymous can read realestate plan prices" ON public.admin_settings;

CREATE POLICY "Anonymous can read realestate plan prices"
ON public.admin_settings
FOR SELECT
TO anon
USING (
  is_encrypted = false
  AND setting_key IN (
    'realestate_plan_price_growth',
    'realestate_plan_price_pro',
    'realestate_plan_price_enterprise'
  )
);
