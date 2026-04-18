-- Split Real Estate plan/deliverable settings from shared keys.
-- Backfill from existing shared values so current behavior remains intact after deployment.

INSERT INTO public.admin_settings (setting_key, setting_value, is_encrypted)
SELECT
  'realestate_plan_price_growth',
  s.setting_value,
  false
FROM public.admin_settings s
WHERE s.setting_key = 'plan_price_growth'
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value;

INSERT INTO public.admin_settings (setting_key, setting_value, is_encrypted)
SELECT
  'realestate_plan_price_pro',
  s.setting_value,
  false
FROM public.admin_settings s
WHERE s.setting_key = 'plan_price_pro'
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value;

INSERT INTO public.admin_settings (setting_key, setting_value, is_encrypted)
SELECT
  'realestate_plan_price_enterprise',
  s.setting_value,
  false
FROM public.admin_settings s
WHERE s.setting_key = 'plan_price_enterprise'
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value;

INSERT INTO public.admin_settings (setting_key, setting_value, is_encrypted)
SELECT
  'realestate_client_deliverable_zip_url',
  s.setting_value,
  false
FROM public.admin_settings s
WHERE s.setting_key = 'client_deliverable_zip_url'
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value;
