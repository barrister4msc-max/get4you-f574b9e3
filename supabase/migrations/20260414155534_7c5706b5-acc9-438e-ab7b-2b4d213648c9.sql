-- Allow admins to upload files to portfolios bucket (for legal documents)
CREATE POLICY "Admins can upload to portfolios"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'portfolios'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to update files in portfolios bucket
CREATE POLICY "Admins can update portfolios"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'portfolios'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to list all files in portfolios bucket
CREATE POLICY "Admins can list all portfolios"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'portfolios'
  AND public.has_role(auth.uid(), 'admin')
);
