
-- 1. Fix SECURITY DEFINER views
ALTER VIEW public.tasks_public SET (security_invoker = true);
ALTER VIEW public.profiles_public SET (security_invoker = true);

-- 2. Add search_path to user-defined functions
ALTER FUNCTION public.check_update_rate() SET search_path = public;
ALTER FUNCTION public.guard_proposal_updates() SET search_path = public;
ALTER FUNCTION public.guard_task_updates() SET search_path = public;
ALTER FUNCTION public.handle_review_rating_refresh() SET search_path = public;
ALTER FUNCTION public.log_geo_update() SET search_path = public;
ALTER FUNCTION public.refresh_profile_rating(p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.search_nearby(lat double precision, lng double precision, radius_meters double precision) SET search_path = public;
ALTER FUNCTION public.set_profile_geo_point() SET search_path = public;
ALTER FUNCTION public.set_profile_location() SET search_path = public;
ALTER FUNCTION public.set_task_geo_point() SET search_path = public;
ALTER FUNCTION public.set_task_location() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 3. Alerts: per-type usage approaching limits in last 24h
CREATE OR REPLACE FUNCTION public.get_ai_usage_alerts(_threshold numeric DEFAULT 0.8)
RETURNS TABLE (
  user_id uuid,
  function_name text,
  request_count bigint,
  daily_limit integer,
  usage_ratio numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH limits(function_name, daily_limit) AS (
    VALUES
      ('task-assistant:assist', 30),
      ('task-assistant:categorize', 50),
      ('task-assistant:voice_to_task', 20),
      ('task-assistant:translate_tasks', 200)
  ),
  agg AS (
    SELECT u.user_id, u.function_name, COUNT(*)::bigint AS request_count
    FROM public.ai_usage u
    WHERE u.used_at >= now() - interval '24 hours'
      AND public.is_admin_or_superadmin(auth.uid())
    GROUP BY u.user_id, u.function_name
  )
  SELECT a.user_id, a.function_name, a.request_count,
         l.daily_limit,
         ROUND((a.request_count::numeric / l.daily_limit), 2) AS usage_ratio
  FROM agg a
  JOIN limits l ON l.function_name = a.function_name
  WHERE a.request_count >= (l.daily_limit * _threshold)
  ORDER BY usage_ratio DESC, a.request_count DESC;
$$;
