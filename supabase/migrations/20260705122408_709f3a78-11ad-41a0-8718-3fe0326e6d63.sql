
-- ================================================================
-- Tasker Matching & Notifications
-- ================================================================

-- 1) tasker_service_categories -----------------------------------
CREATE TABLE public.tasker_service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id)
);
CREATE INDEX idx_tsc_user ON public.tasker_service_categories(user_id);
CREATE INDEX idx_tsc_category ON public.tasker_service_categories(category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasker_service_categories TO authenticated;
GRANT ALL ON public.tasker_service_categories TO service_role;

ALTER TABLE public.tasker_service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tasker categories"
  ON public.tasker_service_categories FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all tasker categories"
  ON public.tasker_service_categories FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- 2) tasker_notification_preferences -----------------------------
CREATE TABLE public.tasker_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  city TEXT,
  radius_km INTEGER NOT NULL DEFAULT 25,
  notify_new_matching_tasks BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  frequency TEXT NOT NULL DEFAULT 'instant' CHECK (frequency IN ('instant','daily')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasker_notification_preferences TO authenticated;
GRANT ALL ON public.tasker_notification_preferences TO service_role;

ALTER TABLE public.tasker_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tasker prefs"
  ON public.tasker_notification_preferences FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all tasker prefs"
  ON public.tasker_notification_preferences FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_tnp_updated_at BEFORE UPDATE ON public.tasker_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) tasker_task_notifications (dedup) ---------------------------
CREATE TABLE public.tasker_task_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tasker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, tasker_user_id, channel, event_type)
);
CREATE INDEX idx_ttn_tasker ON public.tasker_task_notifications(tasker_user_id);
CREATE INDEX idx_ttn_task ON public.tasker_task_notifications(task_id);

GRANT SELECT ON public.tasker_task_notifications TO authenticated;
GRANT ALL ON public.tasker_task_notifications TO service_role;

ALTER TABLE public.tasker_task_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Taskers read own dedup rows"
  ON public.tasker_task_notifications FOR SELECT
  USING (auth.uid() = tasker_user_id);

CREATE POLICY "Admins read all dedup rows"
  ON public.tasker_task_notifications FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- 4) Matching function -------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_matching_taskers_for_task(p_task_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_cat_name TEXT;
  v_tasker RECORD;
  v_count INTEGER := 0;
  v_inserted BOOLEAN;
  v_title TEXT;
  v_msg TEXT;
  v_budget NUMERIC;
BEGIN
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
         tnp.city IS NULL OR tnp.city = ''
         OR v_task.city IS NULL
         OR lower(trim(tnp.city)) = lower(trim(v_task.city))
       )
       AND (
         public.has_role(tsc.user_id, 'executor'::app_role)
         OR EXISTS (SELECT 1 FROM public.user_roles ur
                     WHERE ur.user_id = tsc.user_id AND ur.role::text = 'tasker')
       )
  LOOP
    -- Dedup: in-app
    INSERT INTO public.tasker_task_notifications(task_id, tasker_user_id, channel, event_type)
      VALUES (p_task_id, v_tasker.user_id, 'in_app', 'matching_task_published')
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

    -- Dedup: whatsapp (only if opted in via prefs AND profile opt-in)
    IF EXISTS (
      SELECT 1 FROM public.tasker_notification_preferences tnp2
        JOIN public.profiles pr ON pr.user_id = tnp2.user_id
       WHERE tnp2.user_id = v_tasker.user_id
         AND tnp2.whatsapp_enabled = TRUE
         AND pr.whatsapp_opt_in = TRUE
         AND COALESCE(pr.whatsapp_phone, pr.phone) IS NOT NULL
    ) THEN
      INSERT INTO public.tasker_task_notifications(task_id, tasker_user_id, channel, event_type)
        VALUES (p_task_id, v_tasker.user_id, 'whatsapp', 'matching_task_published')
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
END; $$;

-- 5) Trigger on tasks --------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_tasks_notify_matching()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'open' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.notify_matching_taskers_for_task(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tasks_notify_matching ON public.tasks;
CREATE TRIGGER tasks_notify_matching
  AFTER INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_tasks_notify_matching();

-- 6) app_settings default for matching webhook -------------------
INSERT INTO public.app_settings(key, value, is_public)
  VALUES ('matching_task_webhook_url',
    to_jsonb(''::text),
    false)
  ON CONFLICT (key) DO NOTHING;
