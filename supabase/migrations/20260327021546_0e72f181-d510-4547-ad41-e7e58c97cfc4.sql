
-- Allow admins to insert invoices
CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update invoices
CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete invoices
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
