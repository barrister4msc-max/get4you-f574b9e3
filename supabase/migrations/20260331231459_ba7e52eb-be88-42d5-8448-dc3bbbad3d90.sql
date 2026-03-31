
DROP POLICY "System can insert notifications" ON public.notifications;
CREATE POLICY "No direct inserts" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (false);
