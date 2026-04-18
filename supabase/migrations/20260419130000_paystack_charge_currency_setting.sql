-- Add configurable Paystack charge currency with safe default.
-- KES preserves current production behavior unless switched.

INSERT INTO public.admin_settings (setting_key, setting_value, is_encrypted)
VALUES ('paystack_charge_currency', 'KES', false)
ON CONFLICT (setting_key) DO NOTHING;
