
-- Trigger to create notification when admin sends a direct message to a user
CREATE OR REPLACE FUNCTION public.notify_on_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sender_is_admin BOOLEAN;
  _sender_name TEXT;
BEGIN
  IF NEW.recipient_id IS NULL OR NEW.recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  _sender_is_admin := public.has_role(NEW.sender_id, 'admin'::app_role)
                   OR public.has_role(NEW.sender_id, 'super_admin'::app_role);

  SELECT display_name INTO _sender_name FROM public.profiles WHERE user_id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    NEW.recipient_id,
    CASE WHEN _sender_is_admin THEN 'admin_dm' ELSE 'direct_message' END,
    CASE WHEN _sender_is_admin THEN 'Message from Admin'
         ELSE 'New message from ' || COALESCE(_sender_name, 'User') END,
    LEFT(NEW.content, 140)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_direct_message_notify ON public.direct_messages;
CREATE TRIGGER on_direct_message_notify
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_direct_message();

-- Allow user to reply to admin direct messages
DROP POLICY IF EXISTS "Insert messages with role restrictions" ON public.direct_messages;
CREATE POLICY "Users can send DM if other party is admin"
ON public.direct_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND (
    public.is_admin_or_superadmin(auth.uid())
    OR public.is_admin_or_superadmin(recipient_id)
  )
);
