
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
  v_lang text;
  v_msg text;
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
    user_id, display_name, email, phone,
    whatsapp_phone, whatsapp_opt_in, whatsapp_opt_in_at
  )
  values (
    new.id, v_display_name, new.email, v_phone,
    case when v_whatsapp_opt_in then v_phone else null end,
    v_whatsapp_opt_in,
    case when v_whatsapp_opt_in then now() else null end
  )
  on conflict (user_id) do update set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    email        = coalesce(public.profiles.email, excluded.email);

  insert into public.user_roles (user_id, role)
  values (new.id, 'client')
  on conflict do nothing;

  -- Welcome WhatsApp (best-effort; enqueue_whatsapp internally checks opt-in + phone)
  if v_whatsapp_opt_in and v_phone is not null then
    v_lang := lower(coalesce(new.raw_user_meta_data->>'language', 'en'));
    v_msg := case v_lang
      when 'ru' then 'Добро пожаловать в Flow4You! Ваш аккаунт успешно создан.'
      when 'he' then 'ברוכים הבאים ל-Flow4You! החשבון שלך נוצר בהצלחה.'
      else 'Welcome to Flow4You! Your account has been created successfully.'
    end;
    begin
      perform public.enqueue_whatsapp(
        new.id, 'welcome', null,
        jsonb_build_object('message', v_msg, 'language', v_lang)
      );
    exception when others then
      raise warning 'handle_new_user welcome whatsapp failed: %', sqlerrm;
    end;
  end if;

  return new;
end;
$function$;
