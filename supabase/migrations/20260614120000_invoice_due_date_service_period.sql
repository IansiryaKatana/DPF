-- Paid invoices should use due_date as service period end, not the same instant as invoice_date.

UPDATE public.invoices i
SET due_date = s.current_period_end
FROM public.subscriptions s
WHERE i.user_id = s.user_id
  AND i.status = 'paid'
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end > i.invoice_date
  AND (
    i.due_date IS NULL
    OR i.due_date::date = i.invoice_date::date
  );

UPDATE public.invoices i
SET due_date = c.expires_at
FROM public.client_access_codes c
WHERE i.user_id = c.user_id
  AND i.status = 'paid'
  AND c.expires_at IS NOT NULL
  AND c.expires_at > i.invoice_date
  AND (
    i.due_date IS NULL
    OR i.due_date::date = i.invoice_date::date
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = i.user_id
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > i.invoice_date
  );

UPDATE public.realestate_invoices i
SET due_date = s.current_period_end
FROM public.realestate_subscriptions s
WHERE i.user_id = s.user_id
  AND i.status = 'paid'
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end > i.invoice_date
  AND (
    i.due_date IS NULL
    OR i.due_date::date = i.invoice_date::date
  );

UPDATE public.realestate_invoices i
SET due_date = c.expires_at
FROM public.realestate_client_access_codes c
WHERE i.user_id = c.user_id
  AND i.status = 'paid'
  AND c.expires_at IS NOT NULL
  AND c.expires_at > i.invoice_date
  AND (
    i.due_date IS NULL
    OR i.due_date::date = i.invoice_date::date
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.realestate_subscriptions s
    WHERE s.user_id = i.user_id
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > i.invoice_date
  );
