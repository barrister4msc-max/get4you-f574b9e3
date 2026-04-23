-- Fix get_nearby_tasks: run as SECURITY DEFINER so RLS on `tasks` does not hide
-- public open tasks from anonymous / non-owner users. The function already
-- filters by status='open', which matches the public visibility rules used in
-- the `tasks_public` view, so it is safe to expose these rows.

CREATE OR REPLACE FUNCTION public.get_nearby_tasks(
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  status task_status,
  budget_fixed numeric,
  currency text,
  latitude double precision,
  longitude double precision,
  distance_meters double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  select
    t.id,
    t.title,
    t.description,
    t.status,
    t.budget_fixed,
    t.currency,
    t.latitude,
    t.longitude,
    ST_Distance(
      t.geo_point,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) as distance_meters
  from public.tasks t
  where t.geo_point is not null
    and t.status = 'open'
    and ST_DWithin(
      t.geo_point,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
  order by distance_meters asc;
$function$;

GRANT EXECUTE ON FUNCTION public.get_nearby_tasks(double precision, double precision, integer) TO anon, authenticated;