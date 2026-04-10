-- Allow admins to view all chat messages
CREATE POLICY "Admins can view all chat messages"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to send messages to any task
CREATE POLICY "Admins can send messages"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND auth.uid() = sender_id);