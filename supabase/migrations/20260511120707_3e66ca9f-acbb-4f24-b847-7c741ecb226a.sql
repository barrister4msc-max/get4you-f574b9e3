
-- Admin insert/delete on legal_documents (SELECT is already public)
CREATE POLICY "Admins can insert legal documents"
  ON public.legal_documents FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_superadmin(auth.uid()) AND uploaded_by = auth.uid());

CREATE POLICY "Admins can delete legal documents"
  ON public.legal_documents FOR DELETE TO authenticated
  USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update legal documents"
  ON public.legal_documents FOR UPDATE TO authenticated
  USING (is_admin_or_superadmin(auth.uid()))
  WITH CHECK (is_admin_or_superadmin(auth.uid()));

-- Storage: allow admins full access to portfolios/legal/* (bucket already public-read)
CREATE POLICY "Admins can upload legal files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolios'
    AND (storage.foldername(name))[1] = 'legal'
    AND is_admin_or_superadmin(auth.uid())
  );

CREATE POLICY "Admins can update legal files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portfolios'
    AND (storage.foldername(name))[1] = 'legal'
    AND is_admin_or_superadmin(auth.uid())
  );

CREATE POLICY "Admins can delete legal files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolios'
    AND (storage.foldername(name))[1] = 'legal'
    AND is_admin_or_superadmin(auth.uid())
  );

CREATE POLICY "Admins can list legal files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'portfolios'
    AND (storage.foldername(name))[1] = 'legal'
    AND is_admin_or_superadmin(auth.uid())
  );
