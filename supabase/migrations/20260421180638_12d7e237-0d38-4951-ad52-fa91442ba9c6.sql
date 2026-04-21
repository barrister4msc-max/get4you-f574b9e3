-- ============================================================================
-- 1) Recommended-tasks scoring function (used by /, /dashboard, /tasks)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_recommended_tasks(
  _user_id uuid,
  _user_lat double precision DEFAULT NULL,
  _user_lng double precision DEFAULT NULL,
  _radius_km integer DEFAULT NULL,
  _result_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  description text,
  category_id uuid,
  category_name_en text,
  category_name_ru text,
  category_name_he text,
  city text,
  budget_fixed numeric,
  budget_min numeric,
  budget_max numeric,
  currency text,
  status task_status,
  task_type task_type,
  is_urgent boolean,
  created_at timestamptz,
  latitude double precision,
  longitude double precision,
  photos text[],
  score numeric,
  distance_km double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skills text[];
  v_pref_cats uuid[];
BEGIN
  -- Skills from profile
  SELECT COALESCE(skills, ARRAY[]::text[])
    INTO v_skills
  FROM public.profiles
  WHERE profiles.user_id = _user_id;

  -- Preferred categories from history (proposals + assigned)
  SELECT COALESCE(array_agg(DISTINCT cat_id), ARRAY[]::uuid[])
    INTO v_pref_cats
  FROM (
    SELECT t.category_id AS cat_id
      FROM public.tasks t
     WHERE t.assigned_to = _user_id AND t.category_id IS NOT NULL
    UNION
    SELECT t.category_id
      FROM public.proposals p
      JOIN public.tasks t ON t.id = p.task_id
     WHERE p.user_id = _user_id AND t.category_id IS NOT NULL
  ) sub;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id, t.user_id, t.title, t.description, t.category_id,
      c.name_en, c.name_ru, c.name_he,
      t.city, t.budget_fixed, t.budget_min, t.budget_max, t.currency,
      t.status, t.task_type, t.is_urgent, t.created_at,
      t.latitude, t.longitude, t.photos,
      CASE
        WHEN _user_lat IS NULL OR _user_lng IS NULL OR t.latitude IS NULL OR t.longitude IS NULL
          THEN NULL::double precision
        ELSE 6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians(_user_lat)) * cos(radians(t.latitude)) *
          cos(radians(t.longitude) - radians(_user_lng)) +
          sin(radians(_user_lat)) * sin(radians(t.latitude))
        )))
      END AS distance_km_calc
    FROM public.tasks t
    LEFT JOIN public.categories c ON c.id = t.category_id
    WHERE t.status = 'open'::task_status
      AND t.user_id <> _user_id
  )
  SELECT
    b.id, b.user_id, b.title, b.description, b.category_id,
    b.name_en, b.name_ru, b.name_he,
    b.city, b.budget_fixed, b.budget_min, b.budget_max, b.currency,
    b.status, b.task_type, b.is_urgent, b.created_at,
    b.latitude, b.longitude, b.photos,
    (
      -- Category from history: strongest signal
      CASE WHEN b.category_id = ANY(v_pref_cats) THEN 10 ELSE 0 END
      -- Skill keyword match in title or description
      + COALESCE((
          SELECT COUNT(*) * 3
          FROM unnest(v_skills) AS s
          WHERE s IS NOT NULL AND length(s) >= 3
            AND (lower(b.title) LIKE '%' || lower(s) || '%'
              OR lower(COALESCE(b.description, '')) LIKE '%' || lower(s) || '%')
        ), 0)
      -- Urgency bonus
      + CASE WHEN b.is_urgent THEN 2 ELSE 0 END
      -- Recency bonus (decays over 14 days)
      + GREATEST(0, 5 - EXTRACT(EPOCH FROM (now() - b.created_at)) / 86400 / 3)
    )::numeric AS score,
    b.distance_km_calc AS distance_km
  FROM base b
  WHERE _radius_km IS NULL
     OR b.distance_km_calc IS NULL
     OR b.distance_km_calc <= _radius_km
  ORDER BY score DESC, b.is_urgent DESC NULLS LAST, b.created_at DESC
  LIMIT _result_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_recommended_tasks(uuid, double precision, double precision, integer, integer) TO authenticated, anon;

-- ============================================================================
-- 2) Order history function for taskers (used by /dashboard/history)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_tasker_order_history(_user_id uuid)
RETURNS TABLE (
  escrow_id uuid,
  task_id uuid,
  task_title text,
  client_id uuid,
  amount numeric,
  net_amount numeric,
  commission_amount numeric,
  commission_rate numeric,
  currency text,
  status text,
  held_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS escrow_id,
    e.task_id,
    t.title AS task_title,
    e.client_id,
    e.amount,
    e.net_amount,
    e.commission_amount,
    e.commission_rate,
    e.currency,
    e.status,
    e.held_at,
    e.released_at,
    e.refunded_at,
    e.created_at
  FROM public.escrow_transactions e
  LEFT JOIN public.tasks t ON t.id = e.task_id
  WHERE e.tasker_id = _user_id
  ORDER BY e.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_tasker_order_history(uuid) TO authenticated;

-- ============================================================================
-- 3) Public history list of a tasker for clients viewing proposals
--    (returns only safe fields; no client_id, no amounts beyond status)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_tasker_public_history(_tasker_id uuid, _limit integer DEFAULT 5)
RETURNS TABLE (
  task_title text,
  released_at timestamptz,
  category_name_en text,
  category_name_ru text,
  category_name_he text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.title AS task_title,
    e.released_at,
    c.name_en AS category_name_en,
    c.name_ru AS category_name_ru,
    c.name_he AS category_name_he
  FROM public.escrow_transactions e
  LEFT JOIN public.tasks t ON t.id = e.task_id
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE e.tasker_id = _tasker_id
    AND e.status = 'released'
  ORDER BY e.released_at DESC NULLS LAST
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_tasker_public_history(uuid, integer) TO authenticated, anon;
