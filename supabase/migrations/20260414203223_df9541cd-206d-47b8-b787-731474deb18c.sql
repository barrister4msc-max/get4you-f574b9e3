
-- 1. Update sanitize trigger to also block email addresses
CREATE OR REPLACE FUNCTION public.sanitize_chat_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content ~* '(\+?\d[\d\s\-]{7,}|\b(telegram|whatsapp|viber|watsap|вотсап|телеграм|ватсап)\b|@[a-zA-Z0-9_]{3,}|t\.me/|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})' THEN
    RAISE EXCEPTION 'Sharing contact information is not allowed in chat. Use the platform messaging system.';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Add sanitize trigger to order_messages if not exists
DROP TRIGGER IF EXISTS sanitize_order_message_content ON public.order_messages;
CREATE TRIGGER sanitize_order_message_content
  BEFORE INSERT ON public.order_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sanitize_chat_content();

-- 3. Update start_task to prevent client = executor and require held escrow
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

  -- Prevent self-assignment
  IF _task.user_id = _task.assigned_to THEN
    RAISE EXCEPTION 'Task owner cannot be the executor';
  END IF;

  -- Require held escrow
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
