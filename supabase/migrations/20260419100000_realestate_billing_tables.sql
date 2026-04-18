-- Parallel billing for Real Estate (separate from Shopify subscriptions / invoices / access codes).

CREATE TABLE public.realestate_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'growth',
  status TEXT NOT NULL DEFAULT 'trialing',
  trial_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.realestate_client_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'growth',
  status TEXT NOT NULL DEFAULT 'active',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.realestate_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  invoice_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  stripe_invoice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.realestate_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realestate_client_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realestate_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own realestate subscription"
  ON public.realestate_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all realestate subscriptions"
  ON public.realestate_subscriptions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own realestate access codes"
  ON public.realestate_client_access_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own realestate access codes"
  ON public.realestate_client_access_codes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage realestate access codes"
  ON public.realestate_client_access_codes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own realestate invoices"
  ON public.realestate_invoices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all realestate invoices"
  ON public.realestate_invoices FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_realestate_subscriptions_updated_at
  BEFORE UPDATE ON public.realestate_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trial_end timestamptz;
  v_is_realestate boolean;
BEGIN
  v_is_realestate := COALESCE(NEW.raw_user_meta_data->>'signup_product', '') = 'realestate';

  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');

  IF v_is_realestate THEN
    INSERT INTO public.realestate_user_profile (user_id, full_name, company_name)
    VALUES (
      NEW.id,
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), '')
    );

    v_trial_end := now() + interval '7 days';

    INSERT INTO public.realestate_subscriptions (
      user_id,
      plan,
      status,
      trial_start,
      trial_end,
      current_period_start,
      current_period_end
    )
    VALUES (
      NEW.id,
      'growth',
      'trialing',
      now(),
      v_trial_end,
      now(),
      v_trial_end
    );

    INSERT INTO public.realestate_client_access_codes (
      user_id,
      code,
      plan,
      status,
      issued_at,
      expires_at
    )
    VALUES (
      NEW.id,
      public.generate_client_access_code(),
      'growth',
      'active',
      now(),
      v_trial_end
    );

    RETURN NEW;
  END IF;

  v_trial_end := now() + interval '7 days';

  INSERT INTO public.subscriptions (
    user_id,
    plan,
    status,
    trial_start,
    trial_end,
    current_period_start,
    current_period_end
  )
  VALUES (
    NEW.id,
    'growth',
    'trialing',
    now(),
    v_trial_end,
    now(),
    v_trial_end
  );

  INSERT INTO public.client_access_codes (
    user_id,
    code,
    plan,
    status,
    issued_at,
    expires_at
  )
  VALUES (
    NEW.id,
    public.generate_client_access_code(),
    'growth',
    'active',
    now(),
    v_trial_end
  );

  RETURN NEW;
END;
$$;

-- Backfill Real Estate users created before this migration (profile exists, billing rows missing).
INSERT INTO public.realestate_subscriptions (
  user_id,
  plan,
  status,
  trial_start,
  trial_end,
  current_period_start,
  current_period_end
)
SELECT
  p.user_id,
  'growth',
  'trialing',
  now(),
  now() + interval '7 days',
  now(),
  now() + interval '7 days'
FROM public.realestate_user_profile p
WHERE NOT EXISTS (
  SELECT 1 FROM public.realestate_subscriptions s WHERE s.user_id = p.user_id
);

INSERT INTO public.realestate_client_access_codes (
  user_id,
  code,
  plan,
  status,
  issued_at,
  expires_at
)
SELECT
  p.user_id,
  public.generate_client_access_code(),
  'growth',
  'active',
  now(),
  now() + interval '7 days'
FROM public.realestate_user_profile p
WHERE NOT EXISTS (
  SELECT 1 FROM public.realestate_client_access_codes c WHERE c.user_id = p.user_id
);
