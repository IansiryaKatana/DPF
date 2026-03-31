CREATE TABLE IF NOT EXISTS public.client_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'growth',
  status text NOT NULL DEFAULT 'active',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all access codes"
ON public.client_access_codes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can view own access codes"
ON public.client_access_codes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can redeem own access codes"
ON public.client_access_codes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
