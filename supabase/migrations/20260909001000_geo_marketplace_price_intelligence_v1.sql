-- GEO Marketplace Price Intelligence v1
-- Public, aggregate-only statistics for city x category SEO/GEO pages.
-- IMPORTANT:
--   * Uses marketplace history only (accepted proposals).
--   * Never calls AI and never returns AI-derived estimates.
--   * Returns no row when the local sample is below the publication threshold.
--   * Exposes no task, proposal, user, address, or other row-level identifiers.

CREATE OR REPLACE FUNCTION public.geo_slugify(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(both '-' from regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

COMMENT ON FUNCTION public.geo_slugify(text) IS
  'Deterministic slug normalization used to join public SEO/GEO slugs to marketplace city/category names without fuzzy matching.';

CREATE OR REPLACE FUNCTION public.get_geo_marketplace_price_stats(
  _city_slug text,
  _category_slug text,
  _lookback_days integer DEFAULT 180,
  _min_sample_size integer DEFAULT 10
)
RETURNS TABLE (
  city_slug text,
  category_slug text,
  sample_size bigint,
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
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      public.geo_slugify(_city_slug) AS city_slug,
      public.geo_slugify(_category_slug) AS category_slug,
      greatest(30, least(coalesce(_lookback_days, 180), 730)) AS lookback_days,
      greatest(10, least(coalesce(_min_sample_size, 10), 500)) AS min_sample_size
  ),
  observations AS (
    SELECT
      p.price::numeric AS price,
      p.created_at
    FROM public.proposals p
    JOIN public.tasks t ON t.id = p.task_id
    JOIN public.categories c ON c.id = t.category_id
    CROSS JOIN params x
    WHERE p.status = 'accepted'
      AND p.price IS NOT NULL
      AND p.price > 0
      AND coalesce(upper(p.currency), 'ILS') = 'ILS'
      AND public.geo_slugify(t.city) = x.city_slug
      AND public.geo_slugify(c.name_en) = x.category_slug
      AND p.created_at >= now() - make_interval(days => x.lookback_days)
  ),
  aggregate_stats AS (
    SELECT
      count(*)::bigint AS sample_size,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY price)::numeric AS p25_price,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY price)::numeric AS median_price,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY price)::numeric AS p75_price,
      min(created_at) AS period_start,
      max(created_at) AS period_end
    FROM observations
  )
  SELECT
    x.city_slug,
    x.category_slug,
    s.sample_size,
    round(s.p25_price, 0),
    round(s.median_price, 0),
    round(s.p75_price, 0),
    'ILS'::text,
    s.period_start,
    s.period_end,
    CASE
      WHEN s.sample_size >= 100 THEN 'high'
      WHEN s.sample_size >= 30 THEN 'medium'
      ELSE 'limited'
    END::text,
    'marketplace_history'::text,
    'city_category'::text,
    now()
  FROM aggregate_stats s
  CROSS JOIN params x
  WHERE x.city_slug <> ''
    AND x.category_slug <> ''
    AND s.sample_size >= x.min_sample_size;
$$;

COMMENT ON FUNCTION public.get_geo_marketplace_price_stats(text, text, integer, integer) IS
  'Returns aggregate local marketplace price statistics for GEO/SEO. Fail-closed below n=10. Marketplace history only; never AI-derived.';

-- The function is intentionally callable by anonymous/public pages, but only
-- returns aggregate values after the minimum sample gate.
REVOKE ALL ON FUNCTION public.get_geo_marketplace_price_stats(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_geo_marketplace_price_stats(text, text, integer, integer) TO anon, authenticated;
