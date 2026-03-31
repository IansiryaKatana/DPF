
CREATE TABLE public.email_send_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_name TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  sender_address TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all email logs"
  ON public.email_send_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert email logs"
  ON public.email_send_log
  FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_email_send_log_created_at ON public.email_send_log (created_at DESC);
CREATE INDEX idx_email_send_log_template ON public.email_send_log (template_name);
CREATE INDEX idx_email_send_log_status ON public.email_send_log (status);
