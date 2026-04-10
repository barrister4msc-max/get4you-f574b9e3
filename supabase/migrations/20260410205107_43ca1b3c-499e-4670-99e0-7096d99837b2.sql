CREATE TABLE public.category_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggested_name TEXT NOT NULL,
  suggested_name_ru TEXT,
  suggested_name_he TEXT,
  description TEXT,
  matched_task_ids UUID[] NOT NULL DEFAULT '{}',
  match_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage category suggestions"
  ON public.category_suggestions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert suggestions"
  ON public.category_suggestions
  FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Service role can update suggestions"
  ON public.category_suggestions
  FOR UPDATE
  TO public
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Service role can read suggestions"
  ON public.category_suggestions
  FOR SELECT
  TO public
  USING (auth.role() = 'service_role'::text);

CREATE TRIGGER update_category_suggestions_updated_at
  BEFORE UPDATE ON public.category_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();