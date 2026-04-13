
-- Create order_messages table
CREATE TABLE public.order_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is participant of the order
CREATE OR REPLACE FUNCTION public.is_order_participant(_user_id UUID, _order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.tasks t ON t.id = o.task_id
    WHERE o.id = _order_id
    AND (o.user_id = _user_id OR t.assigned_to = _user_id)
  );
$$;

-- Participants can view messages
CREATE POLICY "Order participants can view messages"
ON public.order_messages
FOR SELECT
TO authenticated
USING (is_order_participant(auth.uid(), order_id));

-- Participants can send messages
CREATE POLICY "Order participants can send messages"
ON public.order_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND is_order_participant(auth.uid(), order_id)
);

-- Admins full access
CREATE POLICY "Admins can manage order messages"
ON public.order_messages
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
