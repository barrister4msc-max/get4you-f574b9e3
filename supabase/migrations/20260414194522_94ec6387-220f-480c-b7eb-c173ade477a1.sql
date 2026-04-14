
-- 1. complete_task: client completes task, releases escrow, payout created by trigger
CREATE OR REPLACE FUNCTION public.complete_task(_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task RECORD;
  _escrow RECORD;
BEGIN
  -- Get task and verify ownership
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF _task.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the task owner can complete this task';
  END IF;
  IF _task.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Task must be in_progress to complete';
  END IF;

  -- Get escrow
  SELECT * INTO _escrow FROM public.escrow_transactions
    WHERE task_id = _task_id AND status = 'held'
    LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No held escrow found for this task';
  END IF;

  -- Release escrow (trigger will create payout)
  UPDATE public.escrow_transactions
    SET status = 'released', released_at = now(), updated_at = now()
    WHERE id = _escrow.id;

  -- Complete task
  UPDATE public.tasks
    SET status = 'completed', updated_at = now()
    WHERE id = _task_id;
END;
$$;

-- 2. start_task: verify escrow is held, then move task to in_progress
CREATE OR REPLACE FUNCTION public.start_task(_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task RECORD;
  _has_escrow BOOLEAN;
BEGIN
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF _task.user_id <> auth.uid() AND _task.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'Only task participants can start this task';
  END IF;
  IF _task.status <> 'open' THEN
    RAISE EXCEPTION 'Task must be open to start';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.escrow_transactions
    WHERE task_id = _task_id AND status = 'held'
  ) INTO _has_escrow;

  IF NOT _has_escrow THEN
    RAISE EXCEPTION 'Payment must be held in escrow before starting the task';
  END IF;

  UPDATE public.tasks
    SET status = 'in_progress', updated_at = now()
    WHERE id = _task_id;
END;
$$;

-- 3. Ensure the payout trigger exists on escrow_transactions
DROP TRIGGER IF EXISTS trg_create_payout_on_release ON public.escrow_transactions;
CREATE TRIGGER trg_create_payout_on_release
  AFTER UPDATE ON public.escrow_transactions
  FOR EACH ROW
  WHEN (NEW.status = 'released' AND OLD.status = 'held')
  EXECUTE FUNCTION public.create_payout_on_release();

-- 4. Recreate auto_complete to use UPDATE (which fires the trigger)
CREATE OR REPLACE FUNCTION public.auto_complete_stale_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completed_count integer := 0;
  _escrow RECORD;
BEGIN
  FOR _escrow IN
    SELECT e.id, e.task_id
    FROM public.escrow_transactions e
    JOIN public.tasks t ON t.id = e.task_id
    WHERE t.status = 'in_progress'
      AND e.status = 'held'
      AND e.held_at < now() - interval '5 days'
  LOOP
    UPDATE public.escrow_transactions
      SET status = 'released', released_at = now(), updated_at = now()
      WHERE id = _escrow.id;
    UPDATE public.tasks
      SET status = 'completed', updated_at = now()
      WHERE id = _escrow.task_id;
    completed_count := completed_count + 1;
  END LOOP;
  RETURN completed_count;
END;
$$;
