-- New WhatsApp workflow: new_matching_request (piggy-backs on existing Matching Engine)

INSERT INTO public.app_settings (key, value)
VALUES (
  'new_matching_request_webhook_url',
  to_jsonb('https://ai.chatbotisrael.com/webhook/whatsapp-workflow/293200.421763.403795.1783517028'::text)
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

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
  v_owner_name TEXT;
  v_task_url TEXT;
  v_has_phone BOOLEAN;
BEGIN
  SELECT (value#>>'{}')::boolean INTO v_enabled
    FROM public.app_settings WHERE key = 'matching_task_enabled';
  IF v_enabled IS DISTINCT FROM TRUE THEN
    RETURN 0;
  END IF;

  SELECT t.id, t.user_id, t.category_id, t.title, t.city, t.address,
         t.currency, t.budget_fixed, t.budget_min, t.budget_max, t.status
    INTO v_task
    FROM public.tasks t WHERE t.id = p_task_id;
  IF NOT FOUND OR v_task.status <> 'open' OR v_task.category_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(name_en, name_ru, name_he) INTO v_cat_name
    FROM public.categories WHERE id = v_task.category_id;

  v_budget := COALESCE(v_task.budget_fixed, v_task.budget_max, v_task.budget_min);

  SELECT COALESCE(full_name, display_name, 'Client') INTO v_owner_name
    FROM public.profiles WHERE user_id = v_task.user_id;

  v_task_url := 'https://4you.ai/tasks/' || p_task_id::text;

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
       AND EXISTS (
         SELECT 1 FROM public.tasker_agreements ta
          WHERE ta.user_id = tsc.user_id
            AND ta.accepted_terms = TRUE
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.proposals pr
          WHERE pr.task_id = p_task_id AND pr.user_id = tsc.user_id
       )
     ORDER BY tsc.user_id
     LIMIT 30
  LOOP
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

    -- NEW workflow: new_matching_request. Reuses the SAME matched tasker
    -- (single source of truth). Only additional gate: a phone must exist.
    SELECT COALESCE(pr.whatsapp_phone, pr.phone) IS NOT NULL
      INTO v_has_phone
      FROM public.profiles pr
     WHERE pr.user_id = v_tasker.user_id;

    IF v_has_phone THEN
      INSERT INTO public.tasker_task_notifications(task_id, tasker_user_id, channel, event_type, matching_score)
        VALUES (p_task_id, v_tasker.user_id, 'whatsapp', 'new_matching_request', 100)
        ON CONFLICT DO NOTHING
        RETURNING TRUE INTO v_inserted;
      IF v_inserted THEN
        PERFORM public.enqueue_whatsapp(
          v_tasker.user_id,
          'new_matching_request',
          p_task_id,
          jsonb_build_object(
            'event', 'new_matching_request',
            'event_type', 'new_matching_request',
            'workflow', 'new_matching_request',
            'source', 'matching_task',
            'task_id', p_task_id,
            'task_title', v_task.title,
            'category_name', v_cat_name,
            'city', v_task.city,
            'address', v_task.address,
            'budget', v_budget,
            'currency', v_task.currency,
            'customer_name', v_owner_name,
            'task_url', v_task_url
          )
        );
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END; $function$;