
-- Translation cache
CREATE TABLE IF NOT EXISTS public.task_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  locale text NOT NULL,
  title text NOT NULL,
  description text,
  source_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, locale)
);
CREATE INDEX IF NOT EXISTS idx_task_translations_task_locale ON public.task_translations(task_id, locale);

ALTER TABLE public.task_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read task translations"
  ON public.task_translations FOR SELECT
  USING (true);

CREATE POLICY "Service role can write translations"
  ON public.task_translations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Allow admins to view all ai_usage
CREATE POLICY "Admins can view all AI usage"
  ON public.ai_usage FOR SELECT
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

-- Stats RPC for admin dashboard
CREATE OR REPLACE FUNCTION public.get_ai_usage_stats(_days integer DEFAULT 7)
RETURNS TABLE (
  function_name text,
  user_id uuid,
  request_count bigint,
  last_used timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT function_name, user_id, COUNT(*)::bigint AS request_count, MAX(used_at) AS last_used
  FROM public.ai_usage
  WHERE used_at >= now() - (_days || ' days')::interval
    AND public.is_admin_or_superadmin(auth.uid())
  GROUP BY function_name, user_id
  ORDER BY request_count DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_usage_daily(_days integer DEFAULT 30)
RETURNS TABLE (
  day date,
  function_name text,
  request_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT used_at::date AS day, function_name, COUNT(*)::bigint AS request_count
  FROM public.ai_usage
  WHERE used_at >= now() - (_days || ' days')::interval
    AND public.is_admin_or_superadmin(auth.uid())
  GROUP BY day, function_name
  ORDER BY day ASC;
$$;
