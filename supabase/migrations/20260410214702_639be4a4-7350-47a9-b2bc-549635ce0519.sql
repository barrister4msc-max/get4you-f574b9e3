
-- Add recipient_id to chat_messages for direct admin-to-user conversations
ALTER TABLE public.chat_messages ADD COLUMN recipient_id uuid;

-- Drop old participant policies and recreate with recipient_id awareness
DROP POLICY IF EXISTS "Task participants can view messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Task participants can send messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Admins can view all chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Admins can send messages" ON public.chat_messages;

-- Admins can view all messages
CREATE POLICY "Admins can view all chat messages"
ON public.chat_messages FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can send messages (with optional recipient_id)
CREATE POLICY "Admins can send messages"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND auth.uid() = sender_id
);

-- Task participants see shared messages (recipient_id IS NULL) or messages directed to them
CREATE POLICY "Task participants can view messages"
ON public.chat_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = chat_messages.task_id
    AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())
    AND t.status = ANY (ARRAY['in_progress'::task_status, 'completed'::task_status])
  )
  AND (
    recipient_id IS NULL
    OR recipient_id = auth.uid()
    OR sender_id = auth.uid()
  )
);

-- Task participants can send shared messages (recipient_id must be null)
CREATE POLICY "Task participants can send messages"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND recipient_id IS NULL
  AND EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = chat_messages.task_id
    AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())
    AND t.status = ANY (ARRAY['in_progress'::task_status, 'completed'::task_status])
  )
);
