INSERT INTO public.admin_settings (setting_key, setting_value, is_encrypted)
VALUES ('active_payment_method', 'stripe', false)
ON CONFLICT (setting_key) DO NOTHING;