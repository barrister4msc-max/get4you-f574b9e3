-- Make the notification trigger resilient: skip if task owner is missing,
-- and avoid blocking proposal insertion if notification insert fails.
CREATE OR REPLACE FUNCTION public.notify_task_owner_on_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  task_owner_id UUID;
  task_title TEXT;
  proposer_name TEXT;
BEGIN
  SELECT user_id, title INTO task_owner_id, task_title
  FROM public.tasks WHERE id = NEW.task_id;

  -- If task owner is missing, skip notification but still allow proposal
  IF task_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Don't notify if the proposer is the same as task owner (defensive; trigger before should block)
  IF task_owner_id = NEW.user_id THEN
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
    -- Never block a proposal because notification failed
    RAISE WARNING 'notify_task_owner_on_proposal failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- Explicit, additive policy so admins (admin / super_admin / superadmin) can always create proposals.
-- This duplicates "Taskers can create proposals" intent but documents admin support.
DROP POLICY IF EXISTS "Admins can create proposals" ON public.proposals;
CREATE POLICY "Admins can create proposals"
ON public.proposals
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND is_admin_or_superadmin(auth.uid())
);