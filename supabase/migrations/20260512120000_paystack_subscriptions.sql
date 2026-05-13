-- Paystack native subscriptions: store Paystack ids and link access codes to a subscription for renewals.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paystack_subscription_code text,
  ADD COLUMN IF NOT EXISTS paystack_customer_code text,
  ADD COLUMN IF NOT EXISTS paystack_non_renewing boolean NOT NULL DEFAULT false;

ALTER TABLE public.realestate_subscriptions
  ADD COLUMN IF NOT EXISTS paystack_subscription_code text,
  ADD COLUMN IF NOT EXISTS paystack_customer_code text,
  ADD COLUMN IF NOT EXISTS paystack_non_renewing boolean NOT NULL DEFAULT false;

ALTER TABLE public.client_access_codes
  ADD COLUMN IF NOT EXISTS paystack_subscription_code text;

ALTER TABLE public.realestate_client_access_codes
  ADD COLUMN IF NOT EXISTS paystack_subscription_code text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_paystack_subscription_code
  ON public.subscriptions (paystack_subscription_code)
  WHERE paystack_subscription_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_realestate_subscriptions_paystack_subscription_code
  ON public.realestate_subscriptions (paystack_subscription_code)
  WHERE paystack_subscription_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_access_codes_paystack_subscription_code
  ON public.client_access_codes (paystack_subscription_code)
  WHERE paystack_subscription_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_realestate_client_access_codes_paystack_subscription_code
  ON public.realestate_client_access_codes (paystack_subscription_code)
  WHERE paystack_subscription_code IS NOT NULL;
