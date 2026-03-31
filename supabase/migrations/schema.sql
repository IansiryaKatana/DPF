-- ============================================
-- DataPulseFlow — Full Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Custom Enum
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

-- 2. Tables
CREATE TABLE public.admin_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setting_key text NOT NULL,
  setting_value text,
  is_encrypted boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_pkey PRIMARY KEY (id),
  CONSTRAINT admin_settings_setting_key_key UNIQUE (setting_key)
);

CREATE TABLE public.api_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_name text NOT NULL,
  credential_value text NOT NULL,
  credential_type text NOT NULL DEFAULT 'webhook_secret'::text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT api_credentials_pkey PRIMARY KEY (id)
);

CREATE TABLE public.demo_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  company_name text,
  message text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  approved boolean NOT NULL DEFAULT false,
  CONSTRAINT demo_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.email_send_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  subject text NOT NULL,
  template_name text,
  status text NOT NULL DEFAULT 'sent'::text,
  error_message text,
  sender_address text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_send_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'usd'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  description text,
  invoice_date timestamp with time zone NOT NULL DEFAULT now(),
  due_date timestamp with time zone,
  paid_at timestamp with time zone,
  stripe_invoice_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invoices_pkey PRIMARY KEY (id)
);

CREATE TABLE public.invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);

CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text,
  company_name text,
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_user_id_key UNIQUE (user_id)
);

CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan text NOT NULL DEFAULT 'growth'::text,
  status text NOT NULL DEFAULT 'trialing'::text,
  trial_start timestamp with time zone NOT NULL DEFAULT now(),
  trial_end timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role)
);

-- 3. Functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'growth', 'trialing');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.invoices
  SET status = 'overdue'
  WHERE status = 'pending'
    AND due_date IS NOT NULL
    AND due_date < now();
END;
$$;

-- 4. Trigger: auto-create profile/role/subscription on new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Triggers: auto-update updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_settings_updated_at BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_api_credentials_updated_at BEFORE UPDATE ON public.api_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable RLS on all tables
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies

-- admin_settings
CREATE POLICY "Admins can manage settings" ON public.admin_settings FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can read public settings" ON public.admin_settings FOR SELECT TO authenticated
  USING ((is_encrypted = false));

-- api_credentials
CREATE POLICY "Admins can manage all credentials" ON public.api_credentials FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own credentials" ON public.api_credentials FOR SELECT TO public
  USING ((auth.uid() = user_id));

-- demo_requests
CREATE POLICY "Admins can update demo requests" ON public.demo_requests FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view demo requests" ON public.demo_requests FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert demo requests" ON public.demo_requests FOR INSERT TO public
  WITH CHECK (true);
CREATE POLICY "Users can view own demo request" ON public.demo_requests FOR SELECT TO authenticated
  USING ((email = (SELECT users.email FROM auth.users WHERE (users.id = auth.uid()))::text));

-- email_send_log
CREATE POLICY "Admins can view all email logs" ON public.email_send_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service can insert email logs" ON public.email_send_log FOR INSERT TO public
  WITH CHECK (true);

-- invoice_items
CREATE POLICY "Admins can manage invoice items" ON public.invoice_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own invoice items" ON public.invoice_items FOR SELECT TO authenticated
  USING ((invoice_id IN (SELECT invoices.id FROM invoices WHERE (invoices.user_id = auth.uid()))));

-- invoices
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all invoices" ON public.invoices FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own invoices" ON public.invoices FOR SELECT TO public
  USING ((auth.uid() = user_id));

-- profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO public
  USING ((auth.uid() = user_id));

-- subscriptions
CREATE POLICY "Admins can view all subscriptions" ON public.subscriptions FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can insert subscriptions" ON public.subscriptions FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT TO public
  USING ((auth.uid() = user_id));

-- user_roles
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO public
  USING ((auth.uid() = user_id));
