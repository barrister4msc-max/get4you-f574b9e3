
-- Employment agreements table
CREATE TABLE public.employment_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  id_number text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  passport_url text,
  teudat_zeut_url text,
  address_proof_url text,
  bank_statement_url text,
  teudat_ole_url text,
  status text NOT NULL DEFAULT 'pending',
  signed_at timestamp with time zone,
  agreement_version text NOT NULL DEFAULT '1.0',
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.employment_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own employment agreements"
  ON public.employment_agreements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own employment agreements"
  ON public.employment_agreements FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all employment agreements"
  ON public.employment_agreements FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update employment agreements"
  ON public.employment_agreements FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Storage bucket for employment docs
INSERT INTO storage.buckets (id, name, public) VALUES ('employment-docs', 'employment-docs', false);

CREATE POLICY "Users can upload own employment docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employment-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own employment docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employment-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can view all employment docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employment-docs' AND public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_employment_agreements_updated_at
  BEFORE UPDATE ON public.employment_agreements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
