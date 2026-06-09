
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
    phone,
    whatsapp_phone,
    whatsapp_opt_in,
    whatsapp_opt_in_at
  )
  values (
    new.id,
    v_display_name,
    v_phone,
    case when v_whatsapp_opt_in then v_phone else null end,
    v_whatsapp_opt_in,
    case when v_whatsapp_opt_in then now() else null end
  )
  on conflict (user_id)
  do update set
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    whatsapp_phone = coalesce(excluded.whatsapp_phone, public.profiles.whatsapp_phone),
    whatsapp_opt_in = excluded.whatsapp_opt_in,
    whatsapp_opt_in_at = case
      when excluded.whatsapp_opt_in = true
       and public.profiles.whatsapp_opt_in is distinct from true
      then now()
      else public.profiles.whatsapp_opt_in_at
    end;

  if v_whatsapp_opt_in and v_phone is not null then
    perform public.enqueue_whatsapp(
      new.id,
      'welcome',
      null,
      jsonb_build_object(
        'message',
        'Добро пожаловать в 4You! Ваш аккаунт успешно создан.'
      )
    );
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, 'client')
  on conflict (user_id, role) do nothing;

  return new;
end;
$function$;

-- Backfill missing display names from auth.users metadata / email
UPDATE public.profiles p
SET display_name = COALESCE(
  NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
  u.email
)
FROM auth.users u
WHERE u.id = p.user_id
  AND (p.display_name IS NULL OR TRIM(p.display_name) = '');
