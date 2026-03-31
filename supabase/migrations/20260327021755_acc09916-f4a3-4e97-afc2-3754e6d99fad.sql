
-- Allow authenticated users to read non-encrypted admin settings (branding)
CREATE POLICY "Authenticated users can read public settings" ON public.admin_settings FOR SELECT TO authenticated USING (is_encrypted = false);
