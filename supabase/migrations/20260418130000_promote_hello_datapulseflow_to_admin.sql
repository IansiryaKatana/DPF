-- Grant app admin role to hello@datapulseflow.com (Shopify /admin + Real Estate /real-estate/admin).
-- Same pattern as promote_legal_contact_to_admin.sql — one `admin` row covers both product suites.

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = lower('hello@datapulseflow.com')
ON CONFLICT (user_id, role) DO NOTHING;
