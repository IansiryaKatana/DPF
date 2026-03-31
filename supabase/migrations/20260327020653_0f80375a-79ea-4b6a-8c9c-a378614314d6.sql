-- Update the user's role to admin
UPDATE public.user_roles SET role = 'admin' WHERE user_id = '20eb6ca6-f05b-424e-96f2-bc6756cbe28c';

-- Also approve their demo request if any
UPDATE public.demo_requests SET approved = true, status = 'approved' WHERE email = 'legal@datapulseflow.com';