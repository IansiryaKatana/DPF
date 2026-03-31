
-- Add approved column to demo_requests for gating access
ALTER TABLE public.demo_requests ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- Allow admins to update demo_requests (approve/reject)
CREATE POLICY "Admins can update demo requests"
ON public.demo_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
