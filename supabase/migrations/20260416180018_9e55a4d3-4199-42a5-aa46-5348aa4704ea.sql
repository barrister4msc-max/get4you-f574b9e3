-- Fix critical privilege escalation: users can only self-assign 'client' or 'tasker'
DROP POLICY IF EXISTS "Users can insert own non-admin roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete own non-admin roles" ON public.user_roles;

CREATE POLICY "Users can insert own basic roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND role IN ('client'::app_role, 'tasker'::app_role));

CREATE POLICY "Users can delete own basic roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND role IN ('client'::app_role, 'tasker'::app_role));

-- Trigger: log ban/unban actions to audit log
CREATE OR REPLACE FUNCTION public.log_ban_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      COALESCE(NEW.banned_by, auth.uid()),
      'ban_user',
      'user',
      NEW.user_id::text,
      jsonb_build_object('reason', NEW.reason)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      COALESCE(auth.uid(), OLD.banned_by),
      'unban_user',
      'user',
      OLD.user_id::text,
      jsonb_build_object('previous_reason', OLD.reason)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS log_ban_changes ON public.banned_users;
CREATE TRIGGER log_ban_changes
  AFTER INSERT OR DELETE ON public.banned_users
  FOR EACH ROW EXECUTE FUNCTION public.log_ban_action();

-- Function to check ban status (callable by anyone for self-check)
CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.banned_users WHERE user_id = _user_id);
$$;