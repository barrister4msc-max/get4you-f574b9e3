CREATE TABLE public.market_price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid, service_type text NOT NULL, service_subtype text,
  country text NOT NULL DEFAULT 'IL', city text NOT NULL, district text,
  provider_name text, provider_domain text NOT NULL, source_url text NOT NULL, source_title text, source_language text,
  price_raw text NOT NULL, price_value numeric, currency text NOT NULL DEFAULT 'ILS',
  pricing_unit text NOT NULL, minimum_price numeric, base_price numeric, price_per_m2 numeric, price_per_hour numeric, price_per_window numeric,
  area_min numeric, area_max numeric,
  included_options jsonb NOT NULL DEFAULT '{}'::jsonb, excluded_options jsonb NOT NULL DEFAULT '{}'::jsonb, extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_published_at timestamptz, source_checked_at timestamptz NOT NULL DEFAULT now(), first_seen_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL, is_active boolean NOT NULL DEFAULT true, confidence numeric NOT NULL DEFAULT 0.8,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mpo_lookup ON public.market_price_observations (service_type, service_subtype, city, source_checked_at DESC);
CREATE INDEX mpo_hash ON public.market_price_observations (content_hash);
GRANT SELECT ON public.market_price_observations TO authenticated;
GRANT ALL ON public.market_price_observations TO service_role;
ALTER TABLE public.market_price_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read observations" ON public.market_price_observations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE public.market_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid, service_type text NOT NULL, service_subtype text,
  country text NOT NULL DEFAULT 'IL', city text NOT NULL, district text, geography text NOT NULL,
  request_key text NOT NULL, request_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  market_min numeric NOT NULL, market_max numeric NOT NULL, market_median numeric NOT NULL, market_average numeric NOT NULL,
  recommended_price numeric NOT NULL, currency text NOT NULL DEFAULT 'ILS',
  number_of_sources integer NOT NULL, number_of_price_observations integer NOT NULL, confidence numeric NOT NULL,
  source_observation_ids uuid[] NOT NULL DEFAULT '{}', result jsonb NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(), fresh_until timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mps_lookup ON public.market_price_snapshots (request_key, calculated_at DESC);
GRANT SELECT ON public.market_price_snapshots TO authenticated;
GRANT ALL ON public.market_price_snapshots TO service_role;
ALTER TABLE public.market_price_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read snapshots" ON public.market_price_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));