-- GEO Marketplace Price Intelligence v1
--
-- Public pages read ONLY pre-aggregated statistics from
-- public.geo_marketplace_price_statistics. Raw tasks/proposals remain private.
-- A private SECURITY DEFINER refresh function may be invoked only by service_role.
-- AI estimates are deliberately excluded from this pipeline.

CREATE OR REPLACE FUNCTION public.geo_slugify(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(both '-' from regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

COMMENT ON FUNCTION public.geo_slugify(text) IS
  'Deterministic GEO slug normalization. No fuzzy matching is used for marketplace price claims.';

CREATE TABLE IF NOT EXISTS public.geo_marketplace_price_statistics (
  city_slug text NOT NULL,
  category_slug text NOT NULL,
  lookback_days integer NOT NULL DEFAULT 180 CHECK (lookback_days BETWEEN 30 AND 730),
  sample_size integer NOT NULL CHECK (sample_size >= 10),
  p25_price numeric NOT NULL CHECK (p25_price > 0),
  median_price numeric NOT NULL CHECK (median_price > 0),
  p75_price numeric NOT NULL CHECK (p75_price > 0),
  currency text NOT NULL DEFAULT 'ILS' CHECK (currency = 'ILS'),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('limited', 'medium', 'high')),
  source text NOT NULL DEFAULT 'marketplace_history' CHECK (source = 'marketplace_history'),
  scope text NOT NULL DEFAULT 'city_category' CHECK (scope = 'city_category'),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (city_slug, category_slug, lookback_days),
  CHECK (city_slug <> ''),
  CHECK (category_slug <> ''),
  CHECK (p25_price <= median_price),
  CHECK (median_price <= p75_price),
  CHECK (period_start <= period_end)
);

COMMENT ON TABLE public.geo_marketplace_price_statistics IS
  'Public aggregate-only marketplace statistics for GEO/SEO. Contains no row-level marketplace/user data and no AI-derived estimates.';

ALTER TABLE public.geo_marketplace_price_statistics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.geo_marketplace_price_statistics FROM PUBLIC;
GRANT SELECT ON TABLE public.geo_marketplace_price_statistics TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read publishable GEO price aggregates"
  ON public.geo_marketplace_price_statistics;
CREATE POLICY "Public can read publishable GEO price aggregates"
  ON public.geo_marketplace_price_statistics
  FOR SELECT
  TO anon, authenticated
  USING (
    sample_size >= 10
    AND source = 'marketplace_history'
    AND scope = 'city_category'
    AND currency = 'ILS'
  );

-- Keep privileged raw-data aggregation outside the exposed public schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.refresh_geo_marketplace_price_statistics(
  _lookback_days integer DEFAULT 180
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_lookback_days integer := greatest(30, least(coalesce(_lookback_days, 180), 730));
  v_rows integer := 0;
BEGIN
  -- Refresh is intentionally fail-closed and marketplace-history-only.
  -- All published groups require at least 10 accepted ILS proposals.
  DELETE FROM public.geo_marketplace_price_statistics
  WHERE lookback_days = v_lookback_days;

  INSERT INTO public.geo_marketplace_price_statistics (
    city_slug,
    category_slug,
    lookback_days,
    sample_size,
    p25_price,
    median_price,
    p75_price,
    currency,
    period_start,
    period_end,
    confidence,
    source,
    scope,
    calculated_at
  )
  SELECT
    public.geo_slugify(t.city) AS city_slug,
    public.geo_slugify(c.name_en) AS category_slug,
    v_lookback_days,
    count(*)::integer AS sample_size,
    round(percentile_cont(0.25) WITHIN GROUP (ORDER BY p.price)::numeric, 0) AS p25_price,
    round(percentile_cont(0.50) WITHIN GROUP (ORDER BY p.price)::numeric, 0) AS median_price,
    round(percentile_cont(0.75) WITHIN GROUP (ORDER BY p.price)::numeric, 0) AS p75_price,
    'ILS',
    min(p.created_at),
    max(p.created_at),
    CASE
      WHEN count(*) >= 100 THEN 'high'
      WHEN count(*) >= 30 THEN 'medium'
      ELSE 'limited'
    END,
    'marketplace_history',
    'city_category',
    now()
  FROM public.proposals p
  JOIN public.tasks t ON t.id = p.task_id
  JOIN public.categories c ON c.id = t.category_id
  WHERE p.status = 'accepted'
    AND p.price IS NOT NULL
    AND p.price > 0
    AND coalesce(upper(p.currency), 'ILS') = 'ILS'
    AND p.created_at >= now() - make_interval(days => v_lookback_days)
    AND public.geo_slugify(t.city) <> ''
    AND public.geo_slugify(c.name_en) <> ''
  GROUP BY public.geo_slugify(t.city), public.geo_slugify(c.name_en)
  HAVING count(*) >= 10;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION private.refresh_geo_marketplace_price_statistics(integer) IS
  'Service-only refresh of aggregate GEO price statistics from accepted marketplace proposals. Never uses AI.';

REVOKE ALL ON FUNCTION private.refresh_geo_marketplace_price_statistics(integer) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.refresh_geo_marketplace_price_statistics(integer) TO service_role;

-- Public RPC reads only the RLS-protected aggregate table. It is SECURITY INVOKER
-- and therefore cannot bypass RLS or reach raw tasks/proposals.
CREATE OR REPLACE FUNCTION public.get_geo_marketplace_price_stats(
  _city_slug text,
  _category_slug text,
  _lookback_days integer DEFAULT 180,
  _min_sample_size integer DEFAULT 10
)
RETURNS TABLE (
  city_slug text,
  category_slug text,
  sample_size integer,
  p25_price numeric,
  median_price numeric,
  p75_price numeric,
  currency text,
  period_start timestamptz,
  period_end timestamptz,
  confidence text,
  source text,
  scope text,
  calculated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.city_slug,
    s.category_slug,
    s.sample_size,
    s.p25_price,
    s.median_price,
    s.p75_price,
    s.currency,
    s.period_start,
    s.period_end,
    s.confidence,
    s.source,
    s.scope,
    s.calculated_at
  FROM public.geo_marketplace_price_statistics s
  WHERE s.city_slug = public.geo_slugify(_city_slug)
    AND s.category_slug = public.geo_slugify(_category_slug)
    AND s.lookback_days = greatest(30, least(coalesce(_lookback_days, 180), 730))
    AND s.sample_size >= greatest(10, least(coalesce(_min_sample_size, 10), 500))
    AND s.source = 'marketplace_history'
    AND s.scope = 'city_category'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_geo_marketplace_price_stats(text, text, integer, integer) IS
  'RLS-safe public reader for pre-aggregated local marketplace price statistics. Never returns AI-derived data.';

REVOKE ALL ON FUNCTION public.get_geo_marketplace_price_stats(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_geo_marketplace_price_stats(text, text, integer, integer) TO anon, authenticated;
