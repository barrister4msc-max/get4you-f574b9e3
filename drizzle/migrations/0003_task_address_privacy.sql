DROP POLICY IF EXISTS deny_banned_users ON public.tasks;
CREATE POLICY deny_banned_users ON public.tasks AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_current_user_banned()) WITH CHECK (NOT public.is_current_user_banned());
CREATE OR REPLACE FUNCTION public.public_task_service_details(category uuid, details jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE result jsonb := '{}'::jsonb; k text; allowed text[];
BEGIN
 allowed := CASE category
 WHEN '393798f1-d8c8-490d-ba3d-934ca5e3730c'::uuid THEN ARRAY['area_m2','cleaning_type','windows','windows_count']
 WHEN '513b748c-2dbf-47ab-b155-5555e0d33765'::uuid THEN ARRAY['from_floor','to_floor','from_elevator','to_elevator','movers'] ELSE ARRAY[]::text[] END;
 FOREACH k IN ARRAY allowed LOOP
 IF k IN ('windows','from_elevator','to_elevator','movers') AND jsonb_typeof(details->k) = 'boolean' THEN result := result || jsonb_build_object(k, details->k);
 ELSIF k IN ('area_m2','windows_count','from_floor','to_floor') AND jsonb_typeof(details->k) = 'number' AND (details->>k)::numeric BETWEEN -5 AND 5000 THEN result := result || jsonb_build_object(k, details->k);
 ELSIF k = 'cleaning_type' AND details->>k IN ('regular','deep','after_renovation','move_in_out') THEN result := result || jsonb_build_object(k, details->k); END IF;
 END LOOP; RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.public_task_title(category uuid, original text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT CASE WHEN category = '513b748c-2dbf-47ab-b155-5555e0d33765'::uuid THEN 'Moving' ELSE original END $$;
CREATE OR REPLACE FUNCTION public.public_task_description(category uuid, original text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT CASE WHEN category = '513b748c-2dbf-47ab-b155-5555e0d33765'::uuid THEN NULL::text ELSE original END $$;
CREATE OR REPLACE FUNCTION public.get_public_task_rows()
RETURNS TABLE(id uuid,title text,description text,category_id uuid,city text,task_type public.task_type,status public.task_status,budget_min numeric,budget_max numeric,budget_fixed numeric,currency text,due_date date,is_urgent boolean,radius_km integer,photos text[],voice_note_url text,user_id uuid,assigned_to uuid,created_at timestamptz,updated_at timestamptz,address text,latitude double precision,longitude double precision,service_details jsonb,schedule_mode text,time_mode text,due_time time,due_time_end time,schedule_timezone text,country_code text,city_id text,neighborhood_id text,geo_source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT t.id,public.public_task_title(t.category_id,t.title),public.public_task_description(t.category_id,t.description),t.category_id,t.city,t.task_type,t.status,t.budget_min,t.budget_max,t.budget_fixed,t.currency,t.due_date,t.is_urgent,t.radius_km,
 CASE WHEN t.category_id='513b748c-2dbf-47ab-b155-5555e0d33765'::uuid THEN NULL::text[] ELSE t.photos END,
 CASE WHEN t.category_id='513b748c-2dbf-47ab-b155-5555e0d33765'::uuid THEN NULL::text ELSE t.voice_note_url END,
 t.user_id,t.assigned_to,t.created_at,t.updated_at,NULL::text,NULL::double precision,NULL::double precision,public.public_task_service_details(t.category_id,t.service_details),t.schedule_mode,t.time_mode,t.due_time,t.due_time_end,t.schedule_timezone,t.country_code,t.city_id,t.neighborhood_id,t.geo_source
 FROM public.tasks t WHERE t.status='open'::public.task_status AND t.user_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.get_public_task_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_task_rows() TO anon,authenticated,service_role;
CREATE OR REPLACE VIEW public.tasks_public WITH (security_invoker=true,security_barrier=true) AS SELECT * FROM public.get_public_task_rows();
REVOKE ALL ON public.tasks_public FROM anon,authenticated;
GRANT SELECT ON public.tasks_public TO anon,authenticated;
GRANT ALL ON public.tasks_public TO service_role;
DO $migration$
DECLARE f record; body text;
BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname IN ('get_nearby_tasks','get_recommended_tasks','get_tasks_for_tasker','get_public_tasks_seo','get_seo_public_tasks','get_tasker_public_history') LOOP
 body := pg_get_functiondef(f.oid);
 body := replace(body,'t.title','public.public_task_title(t.category_id,t.title)');
 body := replace(body,'t.description','public.public_task_description(t.category_id,t.description)');
 IF f.proname='get_recommended_tasks' THEN
 body := replace(body,'public.public_task_title(t.category_id,t.title),','public.public_task_title(t.category_id,t.title) AS title,');
 body := replace(body,'public.public_task_description(t.category_id,t.description),','public.public_task_description(t.category_id,t.description) AS description,');
 body := replace(body,'b.latitude, b.longitude, b.photos,','NULL::double precision, NULL::double precision, CASE WHEN b.category_id=''513b748c-2dbf-47ab-b155-5555e0d33765''::uuid THEN NULL::text[] ELSE b.photos END,');
 body := replace(body,'b.distance_km_calc AS distance_km','NULL::double precision AS distance_km');
 ELSIF f.proname='get_nearby_tasks' THEN
 body := replace(body,'t.latitude,','NULL::double precision,'); body := replace(body,'t.longitude,','NULL::double precision,');
 body := regexp_replace(body,'ST_Distance\([\s\S]*?\) as distance_meters','NULL::double precision as distance_meters','i');
 ELSIF f.proname='get_tasks_for_tasker' THEN
 body := replace(body,E't.latitude,\n',E'NULL::double precision,\n'); body := replace(body,E't.longitude,\n',E'NULL::double precision,\n');
 body := regexp_replace(body,'CASE[\s\S]*?END AS distance_km','NULL::double precision AS distance_km');
 END IF;
 IF f.proname<>'get_tasker_public_history' THEN
 body := replace(body,'where t.status = ''open''::task_status','where t.status = ''open''::task_status AND t.user_id IS NOT NULL');
 body := replace(body,'WHERE t.status = ''open''::task_status','WHERE t.status = ''open''::task_status AND t.user_id IS NOT NULL');
 END IF;
 EXECUTE body;
 END LOOP;
END $migration$;
CREATE OR REPLACE FUNCTION public.get_tasker_order_history(_user_id uuid)
RETURNS TABLE(escrow_id uuid,task_id uuid,task_title text,client_id uuid,amount numeric,net_amount numeric,commission_amount numeric,commission_rate numeric,currency text,status text,held_at timestamptz,released_at timestamptz,refunded_at timestamptz,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT e.id,e.task_id,t.title,e.client_id,e.amount,e.net_amount,e.commission_amount,e.commission_rate,e.currency,e.status,e.held_at,e.released_at,e.refunded_at,e.created_at
 FROM public.escrow_transactions e LEFT JOIN public.tasks t ON t.id=e.task_id WHERE e.tasker_id=_user_id AND (auth.uid()=_user_id OR public.is_admin_or_superadmin(auth.uid())) ORDER BY e.created_at DESC
$$;
DROP POLICY IF EXISTS "Anyone can read task translations" ON public.task_translations;
CREATE POLICY "Read permitted task translations" ON public.task_translations FOR SELECT TO anon,authenticated USING (EXISTS (SELECT 1 FROM public.get_public_task_rows() p WHERE p.id=task_id AND p.category_id IS DISTINCT FROM '513b748c-2dbf-47ab-b155-5555e0d33765'::uuid) OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id=task_id));
COMMENT ON FUNCTION public.public_task_service_details(uuid,jsonb) IS 'Closed per-service public contract: unknown, nested, address and free-text parameters remain private.';
CREATE OR REPLACE FUNCTION public.categories(public.tasks_public) RETURNS SETOF public.categories ROWS 1 LANGUAGE sql STABLE SET search_path=public AS $$ SELECT c.* FROM public.categories c WHERE c.id=($1).category_id $$;
GRANT EXECUTE ON FUNCTION public.categories(public.tasks_public) TO anon,authenticated,service_role;