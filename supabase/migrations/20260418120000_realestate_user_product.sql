-- Real Estate product: membership row in realestate_user_profile (presence = RE suite user).
-- Shopify signups are unchanged (no row here). RE signups set raw_user_meta_data.signup_product = 'realestate'.

CREATE TABLE public.realestate_user_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.realestate_user_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own realestate profile"
  ON public.realestate_user_profile FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own realestate profile"
  ON public.realestate_user_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own realestate profile"
  ON public.realestate_user_profile FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all realestate profiles"
  ON public.realestate_user_profile FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all realestate profiles"
  ON public.realestate_user_profile FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_realestate_user_profile_updated_at
  BEFORE UPDATE ON public.realestate_user_profile
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
