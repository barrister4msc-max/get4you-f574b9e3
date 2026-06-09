
CREATE OR REPLACE FUNCTION public.notify_task_owner_on_new_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_owner uuid;
BEGIN
  SELECT user_id INTO v_task_owner FROM public.tasks WHERE id = NEW.task_id;
  IF v_task_owner IS NULL OR v_task_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, task_id, proposal_id, is_read)
  VALUES (
    v_task_owner,
    'proposal_created',
    'New offer received',
    'A tasker sent you an offer',
    NEW.task_id,
    NEW.id,
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_owner_on_new_proposal ON public.proposals;
CREATE TRIGGER trg_notify_task_owner_on_new_proposal
AFTER INSERT ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_owner_on_new_proposal();
