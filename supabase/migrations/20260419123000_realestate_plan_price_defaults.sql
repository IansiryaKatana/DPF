-- Align Real Estate default plan prices to Monthly / Annual / Lifetime.

INSERT INTO public.admin_settings (setting_key, setting_value, is_encrypted)
VALUES
  ('realestate_plan_price_growth', '499', false),
  ('realestate_plan_price_pro', '4790', false),
  ('realestate_plan_price_enterprise', '14000', false)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value;
