CREATE OR REPLACE FUNCTION public.generate_client_access_code()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT
    'DPF-' ||
    upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
    upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
    upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trial_end timestamptz;
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');

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

INSERT INTO public.client_access_codes (
  user_id,
  code,
  plan,
  status,
  issued_at,
  expires_at
)
SELECT
  s.user_id,
  public.generate_client_access_code(),
  s.plan,
  'active',
  COALESCE(s.trial_start, now()),
  COALESCE(s.trial_end, now() + interval '7 days')
FROM public.subscriptions s
LEFT JOIN LATERAL (
  SELECT 1
  FROM public.client_access_codes c
  WHERE c.user_id = s.user_id
  LIMIT 1
) existing ON true
WHERE s.status = 'trialing'
  AND existing IS NULL;
