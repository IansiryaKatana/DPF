
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
