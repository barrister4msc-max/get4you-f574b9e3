
-- 1. Hide orphan (deleted-user) tasks from public view
CREATE OR REPLACE VIEW public.tasks_public AS
SELECT id, title, description, category_id, city, task_type, status,
       budget_min, budget_max, budget_fixed, currency, due_date, is_urgent,
       radius_km, photos, voice_note_url, user_id, assigned_to,
       created_at, updated_at,
       NULL::text AS address,
       NULL::double precision AS latitude,
       NULL::double precision AS longitude
FROM public.tasks
WHERE status = 'open'::task_status
  AND user_id IS NOT NULL;

-- 2. get_nearby_tasks: skip orphan rows
CREATE OR REPLACE FUNCTION public.get_nearby_tasks(p_lat double precision, p_lng double precision, p_radius_km double precision)
RETURNS TABLE(id uuid, title text, description text, status task_status, budget_fixed numeric, currency text, latitude double precision, longitude double precision, distance_meters double precision)
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  select
    t.id, t.title, t.description, t.status, t.budget_fixed, t.currency,
    t.latitude, t.longitude,
    ST_Distance(t.geo_point, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_meters
  from public.tasks t
  where t.geo_point is not null
    and t.status = 'open'
    and t.user_id is not null
    and ST_DWithin(t.geo_point, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
  order by distance_meters asc;
$$;

-- 3. get_recommended_tasks: skip orphan rows (patch WHERE clause only)
-- Use ALTER via CREATE OR REPLACE preserving signature
DO $patch$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'get_recommended_tasks';
  IF v_src IS NOT NULL AND position('t.user_id is not null' in lower(v_src)) = 0 THEN
    -- Add user_id IS NOT NULL guard
    v_src := replace(v_src,
      'WHERE t.status = ''open''::task_status',
      'WHERE t.status = ''open''::task_status AND t.user_id IS NOT NULL');
    EXECUTE 'CREATE OR REPLACE FUNCTION public.get_recommended_tasks(_user_id uuid, _user_lat double precision, _user_lng double precision, _radius_km double precision, _result_limit integer) RETURNS SETOF record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$' || v_src || '$f$';
  END IF;
END$patch$;

-- 4. Remove duplicate proposal-created notification trigger (kept on_new_proposal which is the canonical one with WhatsApp + 'new_proposal' type)
DROP TRIGGER IF EXISTS trg_notify_task_owner_on_new_proposal ON public.proposals;
DROP FUNCTION IF EXISTS public.notify_task_owner_on_new_proposal();

-- 5. Extend accept trigger to also insert in-app notification for tasker
CREATE OR REPLACE FUNCTION public.notify_tasker_on_proposal_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  task_title TEXT;
BEGIN
  IF NEW.status::text = 'accepted'
     AND (OLD.status IS NULL OR OLD.status::text <> 'accepted')
     AND NEW.user_id IS NOT NULL THEN
    SELECT title INTO task_title FROM public.tasks WHERE id = NEW.task_id;

    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, task_id, proposal_id, is_read)
      VALUES (
        NEW.user_id,
        'proposal_accepted',
        'Your offer was accepted',
        'The client accepted your offer on "' || COALESCE(task_title, 'task') || '"',
        NEW.task_id,
        NEW.id,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_tasker_on_proposal_accept notif failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.enqueue_whatsapp(
        NEW.user_id, 'tasker_hired', NEW.task_id,
        jsonb_build_object(
          'proposal_id', NEW.id,
          'price', NEW.price,
          'currency', COALESCE(NEW.currency, 'USD'),
          'task_title', task_title
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_tasker_on_proposal_accept whatsapp failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
