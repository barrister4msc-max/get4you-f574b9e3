
CREATE TABLE public.contractor_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  id_number text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  agreement_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own agreements"
  ON public.contractor_agreements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own agreements"
  ON public.contractor_agreements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all agreements"
  ON public.contractor_agreements FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
