
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _task RECORD;
  _sender_name TEXT;
  _is_admin BOOLEAN;
BEGIN
  SELECT user_id, assigned_to, title INTO _task FROM public.tasks WHERE id = NEW.task_id;
  SELECT display_name INTO _sender_name FROM public.profiles WHERE user_id = NEW.sender_id;
  
  _is_admin := public.has_role(NEW.sender_id, 'admin'::app_role);
  
  IF _is_admin THEN
    -- Admin message: if recipient_id is set, notify only that user
    IF NEW.recipient_id IS NOT NULL THEN
      IF NEW.recipient_id <> NEW.sender_id THEN
        INSERT INTO public.notifications (user_id, type, title, message, task_id)
        VALUES (
          NEW.recipient_id,
          'new_message',
          'Message from Admin regarding "' || COALESCE(_task.title, 'task') || '"',
          LEFT(NEW.content, 100),
          NEW.task_id
        );
      END IF;
    ELSE
      -- No recipient specified: notify both participants
      IF _task.user_id IS NOT NULL AND _task.user_id <> NEW.sender_id THEN
        INSERT INTO public.notifications (user_id, type, title, message, task_id)
        VALUES (
          _task.user_id,
          'new_message',
          'Message from Admin regarding "' || COALESCE(_task.title, 'task') || '"',
          LEFT(NEW.content, 100),
          NEW.task_id
        );
      END IF;
      IF _task.assigned_to IS NOT NULL AND _task.assigned_to <> NEW.sender_id THEN
        INSERT INTO public.notifications (user_id, type, title, message, task_id)
        VALUES (
          _task.assigned_to,
          'new_message',
          'Message from Admin regarding "' || COALESCE(_task.title, 'task') || '"',
          LEFT(NEW.content, 100),
          NEW.task_id
        );
      END IF;
    END IF;
  ELSE
    -- Regular participant: notify the other side
    DECLARE _recipient_id UUID;
    BEGIN
      IF _task.user_id = NEW.sender_id THEN
        _recipient_id := _task.assigned_to;
      ELSE
        _recipient_id := _task.user_id;
      END IF;
      
      IF _recipient_id IS NULL THEN RETURN NEW; END IF;
      
      INSERT INTO public.notifications (user_id, type, title, message, task_id)
      VALUES (
        _recipient_id,
        'new_message',
        'New message from ' || COALESCE(_sender_name, 'User'),
        LEFT(NEW.content, 100),
        NEW.task_id
      );
    END;
  END IF;
  
  RETURN NEW;
END;
$$;
