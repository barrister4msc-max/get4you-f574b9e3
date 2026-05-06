
-- 1. AI alert thresholds: configurable per function type
CREATE TABLE IF NOT EXISTS public.ai_alert_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL UNIQUE,
  daily_limit integer NOT NULL DEFAULT 30,
  warn_pct integer NOT NULL DEFAULT 70,
  high_pct integer NOT NULL DEFAULT 80,
  critical_pct integer NOT NULL DEFAULT 95,
  block_pct integer NOT NULL DEFAULT 100,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (warn_pct >= 0 AND warn_pct <= high_pct AND high_pct <= critical_pct AND critical_pct <= block_pct AND block_pct <= 200)
);

ALTER TABLE public.ai_alert_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage thresholds" ON public.ai_alert_thresholds;
CREATE POLICY "Admins manage thresholds"
ON public.ai_alert_thresholds
FOR ALL
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read thresholds" ON public.ai_alert_thresholds;
CREATE POLICY "Authenticated can read thresholds"
ON public.ai_alert_thresholds
FOR SELECT
TO authenticated
USING (true);

-- Seed defaults
INSERT INTO public.ai_alert_thresholds (function_name, daily_limit, warn_pct, high_pct, critical_pct, block_pct) VALUES
  ('task-assistant:assist', 30, 70, 80, 95, 100),
  ('task-assistant:categorize', 50, 70, 80, 95, 100),
  ('task-assistant:voice_to_task', 20, 70, 80, 95, 100),
  ('task-assistant:translate_tasks', 200, 70, 80, 95, 100)
ON CONFLICT (function_name) DO NOTHING;

CREATE TRIGGER trg_ai_alert_thresholds_updated_at
BEFORE UPDATE ON public.ai_alert_thresholds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Updated alerts RPC: use configurable thresholds
CREATE OR REPLACE FUNCTION public.get_ai_usage_alerts(_threshold double precision DEFAULT 0.8)
RETURNS TABLE(user_id uuid, function_name text, request_count bigint, daily_limit integer, usage_ratio double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.user_id,
    u.function_name,
    COUNT(*)::bigint AS request_count,
    t.daily_limit,
    (COUNT(*)::double precision / NULLIF(t.daily_limit,0)) AS usage_ratio
  FROM public.ai_usage u
  JOIN public.ai_alert_thresholds t ON t.function_name = u.function_name
  WHERE u.used_at >= now() - interval '24 hours'
    AND public.is_admin_or_superadmin(auth.uid())
  GROUP BY u.user_id, u.function_name, t.daily_limit
  HAVING (COUNT(*)::double precision / NULLIF(t.daily_limit,0)) >= _threshold
  ORDER BY usage_ratio DESC
$$;

REVOKE ALL ON FUNCTION public.get_ai_usage_alerts(double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_alerts(double precision) TO authenticated;

-- 3. Security: revoke anon EXECUTE on internal SECURITY DEFINER functions
DO $$
DECLARE
  fn record;
  keep_list text[] := ARRAY[
    'get_public_tasks_seo','get_public_profile','get_public_profiles',
    'get_nearby_tasks','get_tasker_public_history','track_event','track_rate_limit',
    'st_estimatedextent'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
      AND NOT (p.proname = ANY(keep_list))
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, public', fn.proname, fn.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
