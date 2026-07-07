
-- 1. tasker_agreements table
CREATE TABLE IF NOT EXISTS public.tasker_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agreement_type TEXT NOT NULL DEFAULT 'tasker_agreement',
  agreement_version TEXT NOT NULL,
  locale TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  phone TEXT,
  whatsapp_phone TEXT,
  country TEXT,
  city TEXT,
  tax_status TEXT,
  payout_method TEXT,
  service_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  accepted_terms BOOLEAN NOT NULL DEFAULT false,
  accepted_notifications BOOLEAN NOT NULL DEFAULT false,
  accepted_whatsapp BOOLEAN NOT NULL DEFAULT false,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  snapshot_text TEXT NOT NULL,
  snapshot_text_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasker_agreements_user ON public.tasker_agreements(user_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasker_agreements_version ON public.tasker_agreements(agreement_version);

GRANT SELECT, INSERT ON public.tasker_agreements TO authenticated;
GRANT ALL ON public.tasker_agreements TO service_role;

ALTER TABLE public.tasker_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tasker agreements" ON public.tasker_agreements;
CREATE POLICY "Users can view own tasker agreements"
  ON public.tasker_agreements FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own tasker agreements" ON public.tasker_agreements;
CREATE POLICY "Users can insert own tasker agreements"
  ON public.tasker_agreements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all tasker agreements" ON public.tasker_agreements;
CREATE POLICY "Admins can view all tasker agreements"
  ON public.tasker_agreements FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 2. Update matching function to require signed agreement
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
  END LOOP;

  RETURN v_count;
END; $function$;
