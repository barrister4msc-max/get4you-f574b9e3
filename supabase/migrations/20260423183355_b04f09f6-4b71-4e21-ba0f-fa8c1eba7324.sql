
CREATE OR REPLACE FUNCTION public.log_proposal_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted'::proposal_status THEN
      INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
        VALUES ('proposal_accepted', NEW.user_id, NEW.task_id,
                jsonb_build_object('proposal_id', NEW.id, 'price', NEW.price));
    ELSIF NEW.status = 'rejected'::proposal_status THEN
      INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
        VALUES ('proposal_rejected', NEW.user_id, NEW.task_id,
                jsonb_build_object('proposal_id', NEW.id, 'reason', 'owner_rejected'));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_proposal_status_event ON public.proposals;
CREATE TRIGGER trg_log_proposal_status_event
  AFTER UPDATE OF status ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.log_proposal_status_event();
