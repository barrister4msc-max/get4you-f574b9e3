
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _task RECORD;
  _recipient_id UUID;
  _sender_name TEXT;
BEGIN
  SELECT user_id, assigned_to, title INTO _task FROM public.tasks WHERE id = NEW.task_id;
  
  IF _task.user_id = NEW.sender_id THEN
    _recipient_id := _task.assigned_to;
  ELSE
    _recipient_id := _task.user_id;
  END IF;
  
  IF _recipient_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT display_name INTO _sender_name FROM public.profiles WHERE user_id = NEW.sender_id;
  
  INSERT INTO public.notifications (user_id, type, title, message, task_id)
  VALUES (
    _recipient_id,
    'new_message',
    'New message from ' || COALESCE(_sender_name, 'User'),
    LEFT(NEW.content, 100),
    NEW.task_id
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_chat_message_notify
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_chat_message();
