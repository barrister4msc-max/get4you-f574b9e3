DROP POLICY IF EXISTS "Admins can view all proposals" ON public.proposals;
CREATE POLICY "Admins can view all proposals"
ON public.proposals
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can send messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Task participants can view messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Task participants can send messages" ON public.chat_messages;

CREATE POLICY "Admins can send messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND auth.uid() = sender_id
  AND (
    recipient_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = chat_messages.task_id
        AND (t.user_id = chat_messages.recipient_id OR t.assigned_to = chat_messages.recipient_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.task_id = chat_messages.task_id
        AND p.user_id = chat_messages.recipient_id
    )
  )
);

CREATE POLICY "Task participants can view messages"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = chat_messages.task_id
        AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())
        AND t.status = ANY (ARRAY['in_progress'::task_status, 'completed'::task_status])
    )
    AND (
      recipient_id IS NULL
      OR recipient_id = auth.uid()
      OR sender_id = auth.uid()
    )
  )
  OR (
    EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.task_id = chat_messages.task_id
        AND p.user_id = auth.uid()
    )
    AND (
      recipient_id = auth.uid()
      OR sender_id = auth.uid()
    )
  )
);

CREATE POLICY "Task participants can send messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND (
    (
      recipient_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = chat_messages.task_id
          AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())
          AND t.status = ANY (ARRAY['in_progress'::task_status, 'completed'::task_status])
      )
    )
    OR (
      recipient_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.proposals p
        WHERE p.task_id = chat_messages.task_id
          AND p.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = chat_messages.recipient_id
          AND ur.role = 'admin'::app_role
      )
    )
  )
);

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
  _recipient_id UUID;
BEGIN
  SELECT user_id, assigned_to, title INTO _task
  FROM public.tasks
  WHERE id = NEW.task_id;

  SELECT display_name INTO _sender_name
  FROM public.profiles
  WHERE user_id = NEW.sender_id;

  _is_admin := public.has_role(NEW.sender_id, 'admin'::app_role);

  IF _is_admin THEN
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
    IF NEW.recipient_id IS NOT NULL AND NEW.recipient_id <> NEW.sender_id THEN
      INSERT INTO public.notifications (user_id, type, title, message, task_id)
      VALUES (
        NEW.recipient_id,
        'new_message',
        'New message from ' || COALESCE(_sender_name, 'User'),
        LEFT(NEW.content, 100),
        NEW.task_id
      );
      RETURN NEW;
    END IF;

    IF _task.user_id = NEW.sender_id THEN
      _recipient_id := _task.assigned_to;
    ELSE
      _recipient_id := _task.user_id;
    END IF;

    IF _recipient_id IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (
      _recipient_id,
      'new_message',
      'New message from ' || COALESCE(_sender_name, 'User'),
      LEFT(NEW.content, 100),
      NEW.task_id
    );
  END IF;

  RETURN NEW;
END;
$$;