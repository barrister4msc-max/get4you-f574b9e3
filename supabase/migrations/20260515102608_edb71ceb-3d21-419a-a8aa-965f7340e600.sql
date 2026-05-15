-- Helper: enqueue a WhatsApp message for a user
CREATE OR REPLACE FUNCTION public.enqueue_whatsapp(
  p_user_id uuid,
  p_event_type text,
  p_task_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT phone INTO v_phone FROM public.profiles WHERE user_id = p_user_id;

  INSERT INTO public.whatsapp_logs (
    target_user_id, phone, event_type, task_id, status, metadata
  ) VALUES (
    p_user_id, v_phone, p_event_type, p_task_id, 'pending', COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_whatsapp(uuid, text, uuid, jsonb) FROM public, anon, authenticated;

-- 1) new_proposal → also enqueue WhatsApp to the task owner
CREATE OR REPLACE FUNCTION public.notify_task_owner_on_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_owner_id UUID;
  task_title TEXT;
  proposer_name TEXT;
BEGIN
  SELECT user_id, title INTO task_owner_id, task_title
  FROM public.tasks WHERE id = NEW.task_id;

  IF task_owner_id IS NULL OR task_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO proposer_name FROM public.profiles WHERE user_id = NEW.user_id;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, task_id, proposal_id)
    VALUES (
      task_owner_id, 'new_proposal',
      'New proposal on "' || COALESCE(task_title, 'your task') || '"',
      COALESCE(proposer_name, 'Someone') || ' offered ' || NEW.price || ' ' || COALESCE(NEW.currency, 'USD'),
      NEW.task_id, NEW.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_task_owner_on_proposal notif failed: %', SQLERRM;
  END;

  BEGIN
    PERFORM public.enqueue_whatsapp(
      task_owner_id, 'new_proposal', NEW.task_id,
      jsonb_build_object(
        'proposal_id', NEW.id,
        'price', NEW.price,
        'currency', COALESCE(NEW.currency, 'USD'),
        'task_title', task_title,
        'proposer_name', proposer_name
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_task_owner_on_proposal whatsapp failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 2) tasker_hired → executor when proposal is accepted
CREATE OR REPLACE FUNCTION public.notify_tasker_on_proposal_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_title TEXT;
BEGIN
  IF NEW.status::text = 'accepted'
     AND (OLD.status IS NULL OR OLD.status::text <> 'accepted') THEN
    SELECT title INTO task_title FROM public.tasks WHERE id = NEW.task_id;
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

DROP TRIGGER IF EXISTS trg_notify_tasker_on_proposal_accept ON public.proposals;
CREATE TRIGGER trg_notify_tasker_on_proposal_accept
AFTER UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.notify_tasker_on_proposal_accept();

-- 3) escrow_held + 4) escrow_released → tasker
CREATE OR REPLACE FUNCTION public.notify_on_escrow_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_title TEXT;
BEGIN
  SELECT title INTO task_title FROM public.tasks WHERE id = NEW.task_id;

  IF (TG_OP = 'INSERT' AND COALESCE(NEW.status,'') = 'held')
     OR (TG_OP = 'UPDATE' AND COALESCE(NEW.status,'') = 'held' AND COALESCE(OLD.status,'') <> 'held') THEN
    BEGIN
      PERFORM public.enqueue_whatsapp(
        NEW.tasker_id, 'escrow_held', NEW.task_id,
        jsonb_build_object(
          'escrow_id', NEW.id,
          'amount', NEW.amount,
          'currency', NEW.currency,
          'task_title', task_title
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_on_escrow_event held failed: %', SQLERRM;
    END;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.released_at IS NOT NULL
     AND OLD.released_at IS NULL THEN
    BEGIN
      PERFORM public.enqueue_whatsapp(
        NEW.tasker_id, 'escrow_released', NEW.task_id,
        jsonb_build_object(
          'escrow_id', NEW.id,
          'net_amount', NEW.net_amount,
          'currency', NEW.currency,
          'task_title', task_title
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_on_escrow_event released failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_escrow_event ON public.escrow_transactions;
CREATE TRIGGER trg_notify_on_escrow_event
AFTER INSERT OR UPDATE ON public.escrow_transactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_escrow_event();

-- 4) task_completed → executor (assigned_to)
CREATE OR REPLACE FUNCTION public.notify_on_task_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'completed'
     AND (OLD.status IS NULL OR OLD.status::text <> 'completed')
     AND NEW.assigned_to IS NOT NULL THEN
    BEGIN
      PERFORM public.enqueue_whatsapp(
        NEW.assigned_to, 'task_completed', NEW.id,
        jsonb_build_object('task_title', NEW.title)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_on_task_completed whatsapp failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_task_completed ON public.tasks;
CREATE TRIGGER trg_notify_on_task_completed
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_task_completed();

-- 5) dispute_opened → all admins / super_admins
CREATE OR REPLACE FUNCTION public.notify_admins_on_dispute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_user uuid;
BEGIN
  FOR admin_user IN
    SELECT user_id FROM public.user_roles
    WHERE role IN ('admin'::app_role, 'super_admin'::app_role)
  LOOP
    BEGIN
      PERFORM public.enqueue_whatsapp(
        admin_user, 'dispute_opened', NEW.task_id,
        jsonb_build_object(
          'dispute_id', NEW.id,
          'assignment_id', NEW.assignment_id,
          'opened_by', NEW.opened_by,
          'against_user', NEW.against_user,
          'reason', NEW.reason
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_admins_on_dispute failed: %', SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_dispute ON public.disputes;
CREATE TRIGGER trg_notify_admins_on_dispute
AFTER INSERT ON public.disputes
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_dispute();