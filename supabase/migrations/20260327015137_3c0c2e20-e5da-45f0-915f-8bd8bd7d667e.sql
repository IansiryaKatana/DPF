
-- Allow users to read their own demo request by email
CREATE POLICY "Users can view own demo request"
ON public.demo_requests
FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
