-- RPC: возвращает открытые задачи для исполнителя с дистанцией, фильтром по категории и языку
CREATE OR REPLACE FUNCTION public.get_tasks_for_tasker(
  user_lat double precision DEFAULT NULL,
  user_lng double precision DEFAULT NULL,
  radius_km double precision DEFAULT NULL,
  category_filter uuid DEFAULT NULL,
  language_filter text DEFAULT NULL,
  result_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category_id uuid,
  category_name_en text,
  category_name_ru text,
  category_name_he text,
  city text,
  latitude double precision,
  longitude double precision,
  budget_fixed numeric,
  budget_min numeric,
  budget_max numeric,
  currency text,
  status task_status,
  task_type task_type,
  is_urgent boolean,
  created_at timestamptz,
  user_id uuid,
  owner_language text,
  distance_km double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.title,
    t.description,
    t.category_id,
    c.name_en AS category_name_en,
    c.name_ru AS category_name_ru,
    c.name_he AS category_name_he,
    t.city,
    t.latitude,
    t.longitude,
    t.budget_fixed,
    t.budget_min,
    t.budget_max,
    t.currency,
    t.status,
    t.task_type,
    t.is_urgent,
    t.created_at,
    t.user_id,
    p.preferred_language AS owner_language,
    CASE
      WHEN user_lat IS NULL OR user_lng IS NULL OR t.latitude IS NULL OR t.longitude IS NULL THEN NULL
      ELSE (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(user_lat)) * cos(radians(t.latitude)) *
            cos(radians(t.longitude) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(t.latitude))
          ))
        )
      )
    END AS distance_km
  FROM public.tasks t
  LEFT JOIN public.categories c ON c.id = t.category_id
  LEFT JOIN public.profiles p ON p.user_id = t.user_id
  WHERE t.status = 'open'
    AND t.user_id <> auth.uid()
    AND (t.assigned_to IS NULL)
    AND (category_filter IS NULL OR t.category_id = category_filter)
    AND (language_filter IS NULL OR p.preferred_language = language_filter)
    AND (
      radius_km IS NULL
      OR user_lat IS NULL OR user_lng IS NULL
      OR t.latitude IS NULL OR t.longitude IS NULL
      OR (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(user_lat)) * cos(radians(t.latitude)) *
            cos(radians(t.longitude) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(t.latitude))
          ))
        )
      ) <= radius_km
    )
  ORDER BY
    CASE WHEN t.latitude IS NOT NULL AND user_lat IS NOT NULL THEN 0 ELSE 1 END,
    distance_km ASC NULLS LAST,
    t.is_urgent DESC NULLS LAST,
    t.created_at DESC
  LIMIT GREATEST(1, LEAST(result_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.get_tasks_for_tasker(double precision, double precision, double precision, uuid, text, integer) TO authenticated;