ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS service_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule_mode text NOT NULL DEFAULT 'flexible',
  ADD COLUMN IF NOT EXISTS time_mode text,
  ADD COLUMN IF NOT EXISTS due_time time,
  ADD COLUMN IF NOT EXISTS due_time_end time,
  ADD COLUMN IF NOT EXISTS schedule_timezone text NOT NULL DEFAULT 'Asia/Jerusalem';

COMMENT ON COLUMN public.tasks.due_date IS 'Local calendar date of service execution in schedule_timezone (not creation date)';

CREATE OR REPLACE FUNCTION public.validate_task_schedule()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  local_now timestamp;
BEGIN
  IF NEW.schedule_mode NOT IN ('date','flexible') THEN
    RAISE EXCEPTION 'invalid_schedule_mode';
  END IF;
  IF NEW.schedule_mode = 'flexible' THEN
    NEW.time_mode := NULL; NEW.due_time := NULL; NEW.due_time_end := NULL;
    -- legacy rows may still carry due_date; only clear it when schedule was explicitly set
    IF TG_OP = 'INSERT' THEN NEW.due_date := NULL; END IF;
    RETURN NEW;
  END IF;

  IF NEW.due_date IS NULL THEN RAISE EXCEPTION 'due_date_required'; END IF;
  IF coalesce(NEW.time_mode,'flexible') NOT IN ('exact','interval','flexible') THEN
    RAISE EXCEPTION 'invalid_time_mode';
  END IF;
  IF coalesce(NEW.time_mode,'flexible') = 'flexible' THEN
    NEW.due_time := NULL; NEW.due_time_end := NULL;
  ELSIF NEW.time_mode = 'exact' THEN
    IF NEW.due_time IS NULL THEN RAISE EXCEPTION 'due_time_required'; END IF;
    NEW.due_time_end := NULL;
  ELSE
    IF NEW.due_time IS NULL OR NEW.due_time_end IS NULL THEN RAISE EXCEPTION 'interval_required'; END IF;
    IF NEW.due_time_end <= NEW.due_time THEN RAISE EXCEPTION 'interval_end_before_start'; END IF;
  END IF;

  -- Past checks only when the schedule is being set/changed
  IF TG_OP = 'INSERT'
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.due_time IS DISTINCT FROM OLD.due_time
     OR NEW.schedule_mode IS DISTINCT FROM OLD.schedule_mode THEN
    local_now := now() AT TIME ZONE coalesce(NEW.schedule_timezone, 'Asia/Jerusalem');
    IF NEW.due_date < local_now::date THEN RAISE EXCEPTION 'due_date_in_past'; END IF;
    IF NEW.due_date = local_now::date AND NEW.due_time IS NOT NULL AND NEW.due_time <= local_now::time THEN
      RAISE EXCEPTION 'due_time_in_past';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_validate_schedule ON public.tasks;
CREATE TRIGGER tasks_validate_schedule
BEFORE INSERT OR UPDATE OF schedule_mode, time_mode, due_date, due_time, due_time_end ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_task_schedule();

CREATE OR REPLACE VIEW public.tasks_public AS
 SELECT id, title, description, category_id, city, task_type, status, budget_min, budget_max, budget_fixed,
    currency, due_date, is_urgent, radius_km, photos, voice_note_url, user_id, assigned_to, created_at, updated_at,
    NULL::text AS address, NULL::double precision AS latitude, NULL::double precision AS longitude,
    service_details, schedule_mode, time_mode, due_time, due_time_end, schedule_timezone
   FROM public.tasks
  WHERE status = 'open'::task_status AND user_id IS NOT NULL;