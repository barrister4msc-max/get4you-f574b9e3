DROP FUNCTION IF EXISTS public.get_seo_public_tasks(text, text, integer);

CREATE FUNCTION public.get_seo_public_tasks(
  _city_slug text DEFAULT NULL,
  _category_slug text DEFAULT NULL,
  _result_limit integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  city text,
  category_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.id,
    t.title,
    t.description,
    t.city,
    c.name_en AS category_name,
    t.created_at
  FROM public.tasks t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.status = 'open'::task_status
    AND (
      _city_slug IS NULL
      OR lower(regexp_replace(coalesce(t.city, ''), '\s+', '-', 'g')) = lower(_city_slug)
    )
    AND (
      _category_slug IS NULL
      OR lower(regexp_replace(coalesce(c.name_en, ''), '\s+', '-', 'g')) = lower(_category_slug)
    )
  ORDER BY t.created_at DESC
  LIMIT LEAST(coalesce(_result_limit, 10), 50);
$$;

GRANT EXECUTE ON FUNCTION public.get_seo_public_tasks(text, text, integer) TO anon, authenticated;