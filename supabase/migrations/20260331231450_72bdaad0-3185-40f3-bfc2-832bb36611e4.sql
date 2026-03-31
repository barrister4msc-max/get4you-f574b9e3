
-- Notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'new_proposal',
  title TEXT NOT NULL,
  message TEXT,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- Function to auto-create notification when proposal is inserted
CREATE OR REPLACE FUNCTION public.notify_task_owner_on_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task_owner_id UUID;
  task_title TEXT;
  proposer_name TEXT;
BEGIN
  SELECT user_id, title INTO task_owner_id, task_title FROM public.tasks WHERE id = NEW.task_id;
  SELECT display_name INTO proposer_name FROM public.profiles WHERE user_id = NEW.user_id;
  
  INSERT INTO public.notifications (user_id, type, title, message, task_id, proposal_id)
  VALUES (
    task_owner_id,
    'new_proposal',
    'New proposal on "' || COALESCE(task_title, 'your task') || '"',
    COALESCE(proposer_name, 'Someone') || ' offered ' || NEW.price || ' ' || COALESCE(NEW.currency, 'USD'),
    NEW.task_id,
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_proposal
  AFTER INSERT ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_owner_on_proposal();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
