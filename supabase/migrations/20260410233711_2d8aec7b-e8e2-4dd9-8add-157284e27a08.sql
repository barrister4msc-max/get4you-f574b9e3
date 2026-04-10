
-- Drop old restrictive policies
DROP POLICY IF EXISTS "Task participants can send messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Task participants can view messages" ON public.chat_messages;

-- Helper: check if user is a participant of a task (owner, assigned, or proposer)
CREATE OR REPLACE FUNCTION public.is_task_participant(_user_id uuid, _task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
    AND (t.user_id = _user_id OR t.assigned_to = _user_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.task_id = _task_id AND p.user_id = _user_id
  )
$$;

-- New INSERT policy for non-admin users
CREATE POLICY "Task participants can send messages"
ON public.chat_messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND NOT public.has_role(auth.uid(), 'admin'::app_role)
  AND public.is_task_participant(auth.uid(), task_id)
  AND (
    -- Send to another participant of the same task
    recipient_id IS NULL
    OR public.is_task_participant(recipient_id, task_id)
    OR public.has_role(recipient_id, 'admin'::app_role)
  )
);

-- New SELECT policy for non-admin users
CREATE POLICY "Task participants can view messages"
ON public.chat_messages FOR SELECT
TO authenticated
USING (
  public.is_task_participant(auth.uid(), task_id)
  AND (
    sender_id = auth.uid()
    OR recipient_id = auth.uid()
    OR (recipient_id IS NULL AND (
      EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid()) AND t.status IN ('in_progress','completed'))
    ))
  )
);
