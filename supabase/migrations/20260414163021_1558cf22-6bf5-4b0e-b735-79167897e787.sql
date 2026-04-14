
CREATE TABLE public.legal_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prefix TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

-- Everyone can view legal documents
CREATE POLICY "Anyone can view legal documents"
  ON public.legal_documents FOR SELECT
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert legal documents"
  ON public.legal_documents FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update legal documents"
  ON public.legal_documents FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete legal documents"
  ON public.legal_documents FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
