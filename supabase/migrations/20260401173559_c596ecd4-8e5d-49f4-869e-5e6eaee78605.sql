
-- Chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Only task owner and assigned tasker can view messages
CREATE POLICY "Task participants can view messages"
ON public.chat_messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = chat_messages.task_id
    AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())
    AND t.status IN ('in_progress', 'completed')
  )
);

-- Only task owner and assigned tasker can send messages
CREATE POLICY "Task participants can send messages"
ON public.chat_messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = chat_messages.task_id
    AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())
    AND t.status IN ('in_progress', 'completed')
  )
);

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- AI usage tracking table
CREATE TABLE public.ai_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI usage"
ON public.ai_usage FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI usage"
ON public.ai_usage FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Function to check AI rate limit (20 requests per day per user per function)
CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(_user_id UUID, _function_name TEXT, _max_requests INTEGER DEFAULT 20)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*) FROM public.ai_usage
    WHERE user_id = _user_id
    AND function_name = _function_name
    AND used_at > now() - interval '24 hours'
  ) < _max_requests
$$;
