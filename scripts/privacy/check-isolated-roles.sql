-- Run ONLY against an isolated fixture database, never the application database.
BEGIN;
INSERT INTO public.tasks(id,user_id,assigned_to,category_id,title,description,city,task_type,status,address,latitude,longitude,service_details,schedule_mode,schedule_timezone,country_code,city_id,neighborhood_id)
VALUES ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','513b748c-2dbf-47ab-b155-5555e0d33765','PRIVATE_FROM → PRIVATE_TO','PRIVATE_ACCESS','Synthetic City','onsite','open','PRIVATE_MAIN',32.123456,34.123456,'{"from_address":"PRIVATE_FROM","to_address":"PRIVATE_TO","items":"PRIVATE_ACCESS","from_floor":3,"to_elevator":true,"movers":true,"from_elevator":{"access":"PRIVATE_NESTED"},"unknown":{"secret":"PRIVATE_UNKNOWN"}}','flexible','Asia/Jerusalem','IL','osm:R111','osm:R222');
INSERT INTO public.task_translations VALUES('00000000-0000-0000-0000-000000000010','PRIVATE_TRANSLATED',NULL);
CREATE OR REPLACE FUNCTION public.assert_privacy(expected_private boolean) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE public_row jsonb; private_count int; translations int;
BEGIN
 SELECT to_jsonb(p) INTO public_row FROM public.tasks_public p WHERE p.id='00000000-0000-0000-0000-000000000010';
 IF public_row IS NULL OR public_row::text LIKE '%PRIVATE_%' THEN RAISE EXCEPTION 'Public response missing or leaked private data'; END IF;
 IF public_row->>'city_id'<>'osm:R111' OR public_row->>'neighborhood_id'<>'osm:R222' OR public_row->'service_details' <> '{"from_floor":3,"to_elevator":true,"movers":true}'::jsonb THEN RAISE EXCEPTION 'Safe fields changed'; END IF;
 IF public_row->>'latitude' IS NOT NULL OR public_row->>'address' IS NOT NULL OR public_row->>'longitude' IS NOT NULL THEN RAISE EXCEPTION 'Exact location leaked'; END IF;
 SELECT count(*) INTO private_count FROM public.tasks WHERE address='PRIVATE_MAIN';
 SELECT count(*) INTO translations FROM public.task_translations;
 IF private_count<>expected_private::int OR translations<>expected_private::int THEN RAISE EXCEPTION 'Incorrect private access'; END IF;
END $$;
SET ROLE anon; SELECT public.assert_privacy(false); RESET ROLE;
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003'; SELECT public.assert_privacy(false); RESET ROLE;
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; SELECT public.assert_privacy(true); RESET ROLE;
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'; SELECT public.assert_privacy(true); RESET ROLE;
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000004'; SELECT public.assert_privacy(true); RESET ROLE;
UPDATE public.tasks SET status='cancelled';
SET ROLE anon;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.tasks_public) OR EXISTS(SELECT 1 FROM public.tasks) THEN RAISE EXCEPTION 'Cancelled task visible'; END IF; END $$;
RESET ROLE;
DELETE FROM public.tasks;
SET ROLE anon;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.tasks_public) OR EXISTS(SELECT 1 FROM public.tasks) OR EXISTS(SELECT 1 FROM public.task_translations) THEN RAISE EXCEPTION 'Deleted task visible'; END IF; END $$;
RESET ROLE;

ROLLBACK;
