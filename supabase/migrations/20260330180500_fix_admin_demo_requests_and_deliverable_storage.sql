-- Fix admin demo request access and deliverable ZIP storage permissions

-- 1) Ensure authenticated users can query demo_requests when RLS allows it.
GRANT SELECT, INSERT, UPDATE ON TABLE public.demo_requests TO authenticated;
GRANT INSERT ON TABLE public.demo_requests TO anon;

-- 2) Create storage bucket for client deliverables (private bucket).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-deliverables',
  'client-deliverables',
  false,
  524288000,
  ARRAY['application/zip', 'application/x-zip-compressed']
)
ON CONFLICT (id) DO NOTHING;

-- 3) Storage policies for client deliverables.
CREATE POLICY "Admins can upload client deliverables"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-deliverables'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update client deliverables"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-deliverables'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'client-deliverables'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete client deliverables"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-deliverables'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow authenticated users to read objects so signed URLs can be generated.
CREATE POLICY "Authenticated users can read client deliverables"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'client-deliverables');
