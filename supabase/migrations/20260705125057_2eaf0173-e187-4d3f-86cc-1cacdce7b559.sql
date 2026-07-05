
-- 1. Kill switch
INSERT INTO public.app_settings(key, value)
VALUES ('matching_task_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. matching_score column
ALTER TABLE public.tasker_task_notifications
  ADD COLUMN IF NOT EXISTS matching_score integer NOT NULL DEFAULT 100;

-- 3. Updated function
CREATE OR REPLACE FUNCTION public.notify_matching_taskers_for_task(p_task_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled BOOLEAN;
  v_task RECORD;
  v_cat_name TEXT;
  v_tasker RECORD;
  v_count INTEGER := 0;
  v_inserted BOOLEAN;
  v_title TEXT;
  v_msg TEXT;
  v_budget NUMERIC;
BEGIN
  -- Kill switch
  SELECT (value#>>'{}')::boolean INTO v_enabled
    FROM public.app_settings WHERE key = 'matching_task_enabled';
  IF v_enabled IS DISTINCT FROM TRUE THEN
    RETURN 0;
  END IF;

  SELECT t.id, t.user_id, t.category_id, t.title, t.city,
         t.currency, t.budget_fixed, t.budget_min, t.budget_max, t.status
    INTO v_task
    FROM public.tasks t WHERE t.id = p_task_id;
  IF NOT FOUND OR v_task.status <> 'open' OR v_task.category_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(name_en, name_ru, name_he) INTO v_cat_name
    FROM public.categories WHERE id = v_task.category_id;

  v_budget := COALESCE(v_task.budget_fixed, v_task.budget_max, v_task.budget_min);

  FOR v_tasker IN
    SELECT DISTINCT tsc.user_id
      FROM public.tasker_service_categories tsc
      JOIN public.tasker_notification_preferences tnp ON tnp.user_id = tsc.user_id
      JOIN public.profiles p ON p.user_id = tsc.user_id
     WHERE tsc.category_id = v_task.category_id
       AND tsc.user_id <> v_task.user_id
       AND tnp.notify_new_matching_tasks = TRUE
       AND (
         tnp.city IS NULL OR trim(tnp.city) = ''
         OR v_task.city IS NULL OR trim(v_task.city) = ''
         OR lower(trim(tnp.city)) = lower(trim(v_task.city))
       )
       AND (
         public.has_role(tsc.user_id, 'executor'::app_role)
         OR EXISTS (SELECT 1 FROM public.user_roles ur
                     WHERE ur.user_id = tsc.user_id AND ur.role::text = 'tasker')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.proposals pr
          WHERE pr.task_id = p_task_id AND pr.user_id = tsc.user_id
       )
     ORDER BY tsc.user_id
     LIMIT 30
  LOOP
    -- Dedup: in-app
    INSERT INTO public.tasker_task_notifications(task_id, tasker_user_id, channel, event_type, matching_score)
      VALUES (p_task_id, v_tasker.user_id, 'in_app', 'matching_task_published', 100)
      ON CONFLICT DO NOTHING
      RETURNING TRUE INTO v_inserted;
    IF v_inserted THEN
      v_title := 'New matching task';
      v_msg := COALESCE(v_task.title, 'New task') ||
        CASE WHEN v_cat_name IS NOT NULL THEN ' — ' || v_cat_name ELSE '' END ||
        CASE WHEN v_task.city IS NOT NULL THEN ' (' || v_task.city || ')' ELSE '' END;
      INSERT INTO public.notifications(user_id, type, title, message, task_id)
        VALUES (v_tasker.user_id, 'matching_task_published', v_title, v_msg, p_task_id);
      v_count := v_count + 1;
    END IF;

    -- Dedup: whatsapp
    IF EXISTS (
      SELECT 1 FROM public.tasker_notification_preferences tnp2
        JOIN public.profiles pr ON pr.user_id = tnp2.user_id
       WHERE tnp2.user_id = v_tasker.user_id
         AND tnp2.whatsapp_enabled = TRUE
         AND pr.whatsapp_opt_in = TRUE
         AND COALESCE(pr.whatsapp_phone, pr.phone) IS NOT NULL
    ) THEN
      INSERT INTO public.tasker_task_notifications(task_id, tasker_user_id, channel, event_type, matching_score)
        VALUES (p_task_id, v_tasker.user_id, 'whatsapp', 'matching_task_published', 100)
        ON CONFLICT DO NOTHING
        RETURNING TRUE INTO v_inserted;
      IF v_inserted THEN
        PERFORM public.enqueue_whatsapp(
          v_tasker.user_id,
          'matching_task_published',
          p_task_id,
          jsonb_build_object(
            'event', 'matching_task_published',
            'workflow', 'matching_task',
            'task_id', p_task_id,
            'task_title', v_task.title,
            'category_name', v_cat_name,
            'city', v_task.city,
            'budget', v_budget,
            'currency', v_task.currency,
            'source', 'flow4you'
          )
        );
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END; $function$;
