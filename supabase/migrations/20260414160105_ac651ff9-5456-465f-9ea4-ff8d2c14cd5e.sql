-- Allow admins to delete files in portfolios bucket
CREATE POLICY "Admins can delete from portfolios"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'portfolios'
  AND public.has_role(auth.uid(), 'admin')
);
