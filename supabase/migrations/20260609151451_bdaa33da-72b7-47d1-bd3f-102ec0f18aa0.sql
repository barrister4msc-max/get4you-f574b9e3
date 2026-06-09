
DROP FUNCTION IF EXISTS public.admin_force_delete_auth_user(uuid);

CREATE OR REPLACE FUNCTION public.admin_force_delete_auth_user(_actor uuid, _target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _actor IS NULL OR NOT public.has_role(_actor, 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;
  IF _target = _actor THEN
    RAISE EXCEPTION 'cannot delete your own account';
  END IF;
  UPDATE public.tasks SET assigned_to = NULL WHERE assigned_to = _target;
  DELETE FROM public.user_roles WHERE user_id = _target;
  DELETE FROM public.profiles   WHERE user_id = _target;
  DELETE FROM auth.users        WHERE id      = _target;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_delete_auth_user(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_auth_user(uuid, uuid) TO authenticated, service_role;
