-- ============================================
-- DataPulseFlow — Seed Data
-- Run AFTER schema.sql
-- ============================================

-- Admin settings (company branding & payment config)
INSERT INTO public.admin_settings (setting_key, setting_value, is_encrypted) VALUES
  ('active_payment_method', 'paypal', false),
  ('paypal_client_id', 'YOUR_PAYPAL_CLIENT_ID', true),
  ('paypal_client_secret', 'YOUR_PAYPAL_CLIENT_SECRET', true),
  ('paypal_sandbox_mode', 'true', true);

-- NOTE: profiles, user_roles, and subscriptions are auto-created
-- by the handle_new_user() trigger when a user signs up.
-- 
-- To make a user an admin after signup, run:
--   INSERT INTO public.user_roles (user_id, role) VALUES ('<user-uuid>', 'admin');
--
-- Demo requests, invoices, invoice_items, email_send_log, and
-- api_credentials are created through the application UI.
