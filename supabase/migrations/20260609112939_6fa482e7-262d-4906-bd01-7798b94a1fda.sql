CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _name text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _uid) THEN
    RETURN;
  END IF;

  SELECT u.email,
         COALESCE(u.raw_user_meta_data->>'display_name',
                  u.raw_user_meta_data->>'full_name',
                  u.raw_user_meta_data->>'name',
                  u.email)
    INTO _email, _name
    FROM auth.users u
   WHERE u.id = _uid;

  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (_uid, _name, _email)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'client')
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;