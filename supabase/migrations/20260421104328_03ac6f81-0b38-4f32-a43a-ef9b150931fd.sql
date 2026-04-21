CREATE OR REPLACE FUNCTION public.log_admin_actions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _is_admin boolean := false;
  _affected_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _affected_id := OLD.id::text;
  ELSE
    _affected_id := NEW.id::text;
  END IF;

  IF _actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _is_admin := public.has_role(_actor, 'admin'::public.app_role)
    OR public.has_role(_actor, 'superadmin'::public.app_role);

  IF _is_admin THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      _actor,
      lower(TG_OP),
      TG_TABLE_NAME,
      _affected_id,
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_admin_task_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _is_admin boolean;
BEGIN
  IF _actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _is_admin := public.has_role(_actor, 'admin'::public.app_role)
    OR public.has_role(_actor, 'superadmin'::public.app_role);

  IF _is_admin AND COALESCE(NEW.user_id, OLD.user_id) <> _actor THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      _actor,
      'admin_task_' || lower(TG_OP),
      'task',
      COALESCE(NEW.id, OLD.id)::text,
      jsonb_build_object(
        'old_status', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
        'new_status', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END,
        'task_owner', COALESCE(NEW.user_id, OLD.user_id)
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_admin_money_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _is_super boolean;
BEGIN
  IF _actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _is_super := public.has_role(_actor, 'superadmin'::public.app_role);

  IF _is_super THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      _actor,
      'super_admin_' || TG_TABLE_NAME || '_' || lower(TG_OP),
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id)::text,
      jsonb_build_object(
        'old_status', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
        'new_status', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END,
        'amount', COALESCE(NEW.amount, OLD.amount)
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sender_is_admin boolean;
  _sender_name text;
BEGIN
  IF NEW.recipient_id IS NULL OR NEW.recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  _sender_is_admin := public.has_role(NEW.sender_id, 'admin'::public.app_role)
    OR public.has_role(NEW.sender_id, 'superadmin'::public.app_role);

  SELECT display_name INTO _sender_name
  FROM public.profiles
  WHERE user_id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    NEW.recipient_id,
    CASE WHEN _sender_is_admin THEN 'admin_dm' ELSE 'direct_message' END,
    CASE
      WHEN _sender_is_admin THEN 'Message from Admin'
      ELSE 'New message from ' || COALESCE(_sender_name, 'User')
    END,
    LEFT(NEW.content, 140)
  );

  RETURN NEW;
END;
$$;