
-- 1) handle_new_user: also populate profiles.email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_phone text;
  v_whatsapp_opt_in boolean;
  v_display_name text;
begin
  v_phone := public.normalize_phone_e164(
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '')
  );

  v_whatsapp_opt_in := coalesce(
    (new.raw_user_meta_data->>'whatsapp_opt_in')::boolean,
    false
  );

  v_display_name := nullif(trim(coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.email,
    ''
  )), '');

  insert into public.profiles (
    user_id,
    display_name,
    email,
    phone,
    whatsapp_phone,
    whatsapp_opt_in,
    whatsapp_opt_in_at
  )
  values (
    new.id,
    v_display_name,
    new.email,
    v_phone,
    case when v_whatsapp_opt_in then v_phone else null end,
    v_whatsapp_opt_in,
    case when v_whatsapp_opt_in then now() else null end
  )
  on conflict (user_id) do update set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    email        = coalesce(public.profiles.email, excluded.email);

  -- default role: client (idempotent)
  insert into public.user_roles (user_id, role)
  values (new.id, 'client')
  on conflict do nothing;

  return new;
end;
$function$;

-- 2) ensure_profile: also backfill email / display_name on existing profile
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _name text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
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
  ON CONFLICT (user_id) DO UPDATE SET
    email        = COALESCE(public.profiles.email, EXCLUDED.email),
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'client')
  ON CONFLICT DO NOTHING;
END;
$function$;

-- 3) Backfill missing email on existing profiles
UPDATE public.profiles p
   SET email = u.email
  FROM auth.users u
 WHERE p.user_id = u.id
   AND (p.email IS NULL OR p.email = '')
   AND u.email IS NOT NULL;

-- 4) Create profile for any orphan role
INSERT INTO public.profiles (user_id, display_name, email)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'display_name',
                u.raw_user_meta_data->>'full_name',
                u.raw_user_meta_data->>'name',
                u.email),
       u.email
  FROM public.user_roles r
  JOIN auth.users u ON u.id = r.user_id
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = r.user_id)
ON CONFLICT (user_id) DO NOTHING;
