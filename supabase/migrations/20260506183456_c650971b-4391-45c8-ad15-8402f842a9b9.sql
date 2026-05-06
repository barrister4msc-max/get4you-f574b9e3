
-- Enable RLS on internal helper tables
ALTER TABLE public.geo_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view geo audit log" ON public.geo_audit_log;
CREATE POLICY "Admins can view geo audit log"
  ON public.geo_audit_log FOR SELECT
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages rate_limit" ON public.rate_limit;
CREATE POLICY "Service role manages rate_limit"
  ON public.rate_limit FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Restrict SECURITY DEFINER stat functions to authenticated callers only
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_stats(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_daily(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_alerts(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_daily(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_alerts(numeric) TO authenticated;
