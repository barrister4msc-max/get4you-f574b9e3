
-- Table for Esek Patur applications
CREATE TABLE public.esek_patur_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  id_number text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  activity_type text NOT NULL,
  passport_url text,
  teudat_zeut_url text,
  address_proof_url text,
  bank_statement_url text,
  teudat_ole_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.esek_patur_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own applications"
ON public.esek_patur_applications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own applications"
ON public.esek_patur_applications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all applications"
ON public.esek_patur_applications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('esek-patur-docs', 'esek-patur-docs', false);

CREATE POLICY "Users can upload esek patur docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'esek-patur-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own esek patur docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'esek-patur-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can view all esek patur docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'esek-patur-docs' AND public.has_role(auth.uid(), 'admin'));
