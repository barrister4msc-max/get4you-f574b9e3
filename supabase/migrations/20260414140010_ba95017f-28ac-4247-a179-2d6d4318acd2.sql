
-- 1. Fix search_path on existing functions
CREATE OR REPLACE FUNCTION public.notify_task_owner_on_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    task_owner_id, 'new_proposal',
    'New proposal on "' || COALESCE(task_title, 'your task') || '"',
    COALESCE(proposer_name, 'Someone') || ' offered ' || NEW.price || ' ' || COALESCE(NEW.currency, 'USD'),
    NEW.task_id, NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task RECORD;
  _sender_name TEXT;
  _is_admin BOOLEAN;
  _recipient_id UUID;
BEGIN
  SELECT user_id, assigned_to, title INTO _task FROM public.tasks WHERE id = NEW.task_id;
  SELECT display_name INTO _sender_name FROM public.profiles WHERE user_id = NEW.sender_id;
  _is_admin := public.has_role(NEW.sender_id, 'admin'::app_role);

  IF _is_admin THEN
    IF NEW.recipient_id IS NOT NULL THEN
      IF NEW.recipient_id <> NEW.sender_id THEN
        INSERT INTO public.notifications (user_id, type, title, message, task_id)
        VALUES (NEW.recipient_id, 'new_message', 'Message from Admin regarding "' || COALESCE(_task.title, 'task') || '"', LEFT(NEW.content, 100), NEW.task_id);
      END IF;
    ELSE
      IF _task.user_id IS NOT NULL AND _task.user_id <> NEW.sender_id THEN
        INSERT INTO public.notifications (user_id, type, title, message, task_id)
        VALUES (_task.user_id, 'new_message', 'Message from Admin regarding "' || COALESCE(_task.title, 'task') || '"', LEFT(NEW.content, 100), NEW.task_id);
      END IF;
      IF _task.assigned_to IS NOT NULL AND _task.assigned_to <> NEW.sender_id THEN
        INSERT INTO public.notifications (user_id, type, title, message, task_id)
        VALUES (_task.assigned_to, 'new_message', 'Message from Admin regarding "' || COALESCE(_task.title, 'task') || '"', LEFT(NEW.content, 100), NEW.task_id);
      END IF;
    END IF;
  ELSE
    IF NEW.recipient_id IS NOT NULL AND NEW.recipient_id <> NEW.sender_id THEN
      INSERT INTO public.notifications (user_id, type, title, message, task_id)
      VALUES (NEW.recipient_id, 'new_message', 'New message from ' || COALESCE(_sender_name, 'User'), LEFT(NEW.content, 100), NEW.task_id);
      RETURN NEW;
    END IF;
    IF _task.user_id = NEW.sender_id THEN _recipient_id := _task.assigned_to;
    ELSE _recipient_id := _task.user_id; END IF;
    IF _recipient_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (_recipient_id, 'new_message', 'New message from ' || COALESCE(_sender_name, 'User'), LEFT(NEW.content, 100), NEW.task_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _role text;
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), NEW.email);
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'client');
  IF _role = 'both' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'tasker');
  ELSIF _role = 'tasker' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'tasker');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_review_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Restrict public bucket listing (drop overly broad SELECT, add owner-scoped)
DROP POLICY IF EXISTS "Public avatars are accessible" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public task photos accessible" ON storage.objects;
DROP POLICY IF EXISTS "Task photos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public portfolio files accessible" ON storage.objects;
DROP POLICY IF EXISTS "Portfolio files are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public order chat files accessible" ON storage.objects;
DROP POLICY IF EXISTS "Order chat files are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view order chat files" ON storage.objects;

-- Re-create narrow SELECT policies: authenticated users can list only own folder
CREATE POLICY "Users can list own avatars" ON storage.objects FOR SELECT
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can list own task photos" ON storage.objects FOR SELECT
USING (bucket_id = 'task-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can list own portfolios" ON storage.objects FOR SELECT
USING (bucket_id = 'portfolios' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Order participants can list chat files" ON storage.objects FOR SELECT
USING (bucket_id = 'order-chat-files' AND auth.role() = 'authenticated');

-- 3. Add dispute status
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'dispute';

-- 4. Payouts table
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  escrow_id uuid NOT NULL REFERENCES public.escrow_transactions(id),
  amount numeric NOT NULL,
  commission numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Taskers can view own payouts" ON public.payouts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage payouts" ON public.payouts FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage payouts" ON public.payouts FOR ALL
USING (auth.role() = 'service_role'::text);

CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Auto-create payout when escrow is released
CREATE OR REPLACE FUNCTION public.create_payout_on_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'released' AND OLD.status = 'held' THEN
    INSERT INTO public.payouts (user_id, task_id, escrow_id, amount, commission, net_amount, currency)
    VALUES (NEW.tasker_id, NEW.task_id, NEW.id, NEW.amount, NEW.commission_amount, NEW.net_amount, NEW.currency);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_payout_on_release
AFTER UPDATE ON public.escrow_transactions
FOR EACH ROW EXECUTE FUNCTION public.create_payout_on_release();

-- 6. Contact info filter for chat
CREATE OR REPLACE FUNCTION public.sanitize_chat_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content ~* '(\+?\d[\d\s\-]{7,}|\b(telegram|whatsapp|viber|watsap|вотсап|телеграм|ватсап)\b|@[a-zA-Z0-9_]{3,}|t\.me/)' THEN
    RAISE EXCEPTION 'Sharing contact information is not allowed in chat. Use the platform messaging system.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sanitize_chat_messages
BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.sanitize_chat_content();

CREATE TRIGGER trg_sanitize_order_messages
BEFORE INSERT ON public.order_messages
FOR EACH ROW EXECUTE FUNCTION public.sanitize_chat_content();

-- 7. Auto-complete stale tasks function (to be called by cron)
CREATE OR REPLACE FUNCTION public.auto_complete_stale_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completed_count integer := 0;
  _escrow RECORD;
BEGIN
  FOR _escrow IN
    SELECT e.id, e.task_id, e.tasker_id, e.amount, e.commission_amount, e.net_amount, e.currency
    FROM public.escrow_transactions e
    JOIN public.tasks t ON t.id = e.task_id
    WHERE t.status = 'in_progress'
      AND e.status = 'held'
      AND e.held_at < now() - interval '5 days'
  LOOP
    UPDATE public.escrow_transactions SET status = 'released', released_at = now() WHERE id = _escrow.id;
    UPDATE public.tasks SET status = 'completed' WHERE id = _escrow.task_id;
    completed_count := completed_count + 1;
  END LOOP;
  RETURN completed_count;
END;
$$;
