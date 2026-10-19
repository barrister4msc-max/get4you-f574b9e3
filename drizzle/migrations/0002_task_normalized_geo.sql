ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS city_id text,
  ADD COLUMN IF NOT EXISTS neighborhood_id text,
  ADD COLUMN IF NOT EXISTS geo_source text;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_country_code_chk CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT tasks_city_id_chk CHECK (city_id IS NULL OR city_id ~ '^osm:[RNW][0-9]+$'),
  ADD CONSTRAINT tasks_neighborhood_id_chk CHECK (neighborhood_id IS NULL OR (city_id IS NOT NULL AND neighborhood_id ~ '^osm:[RNW][0-9]+$')),
  ADD CONSTRAINT tasks_geo_source_chk CHECK (geo_source IS NULL OR geo_source = 'osm');
COMMENT ON COLUMN public.tasks.city_id IS 'Stable city ID mapped from OpenStreetMap (osm:R<relation>), same across languages';
COMMENT ON COLUMN public.tasks.neighborhood_id IS 'Urban neighborhood (OSM suburb/neighbourhood/quarter), NULL when unknown; never an administrative district';
CREATE INDEX IF NOT EXISTS tasks_city_id_idx ON public.tasks (category_id, city_id) WHERE status = 'completed';