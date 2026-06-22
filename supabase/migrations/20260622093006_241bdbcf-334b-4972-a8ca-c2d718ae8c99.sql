
-- Auto-copy phone -> whatsapp_phone when opted in but whatsapp_phone empty
CREATE OR REPLACE FUNCTION public.sync_whatsapp_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if coalesce(NEW.whatsapp_opt_in, false) = true
     and (NEW.whatsapp_phone is null or length(trim(NEW.whatsapp_phone)) = 0)
     and NEW.phone is not null and length(trim(NEW.phone)) > 0 then
    NEW.whatsapp_phone := NEW.phone;
    if NEW.whatsapp_opt_in_at is null then
      NEW.whatsapp_opt_in_at := now();
    end if;
  end if;
  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_sync_whatsapp_phone ON public.profiles;
CREATE TRIGGER trg_sync_whatsapp_phone
BEFORE INSERT OR UPDATE OF phone, whatsapp_phone, whatsapp_opt_in
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_whatsapp_phone();

-- Broaden the welcome trigger: fire when opt_in flips on OR when phone first appears while opted-in
CREATE OR REPLACE FUNCTION public.notify_welcome_whatsapp_on_optin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_phone text;
  v_old_phone text;
  v_lang text;
  v_msg text;
  v_exists boolean;
  v_opt_in_flipped boolean;
  v_phone_appeared boolean;
begin
  v_opt_in_flipped := coalesce(NEW.whatsapp_opt_in, false) = true
                      and coalesce(OLD.whatsapp_opt_in, false) = false;

  v_phone := coalesce(NEW.whatsapp_phone, NEW.phone);
  v_old_phone := coalesce(OLD.whatsapp_phone, OLD.phone);

  v_phone_appeared := coalesce(NEW.whatsapp_opt_in, false) = true
                      and (v_old_phone is null or length(trim(v_old_phone)) = 0)
                      and (v_phone is not null and length(trim(v_phone)) > 0);

  if not (v_opt_in_flipped or v_phone_appeared) then
    return NEW;
  end if;

  if v_phone is null or length(trim(v_phone)) = 0 then
    return NEW;
  end if;

  select exists(
    select 1 from public.whatsapp_logs
    where target_user_id = NEW.user_id and event_type = 'welcome'
  ) into v_exists;
  if v_exists then
    return NEW;
  end if;

  v_lang := lower(coalesce(NEW.preferred_language, 'en'));
  v_msg := case v_lang
    when 'ru' then 'Добро пожаловать в Flow4You! Ваш аккаунт успешно создан.'
    when 'he' then 'ברוכים הבאים ל-Flow4You! החשבון שלך נוצר בהצלחה.'
    else 'Welcome to Flow4You! Your account has been created successfully.'
  end;

  begin
    perform public.enqueue_whatsapp(
      NEW.user_id, 'welcome', null,
      jsonb_build_object('message', v_msg, 'language', v_lang)
    );
  exception when others then
    raise warning 'notify_welcome_whatsapp_on_optin failed: %', sqlerrm;
  end;

  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_welcome_whatsapp_on_optin ON public.profiles;
CREATE TRIGGER trg_welcome_whatsapp_on_optin
AFTER UPDATE OF whatsapp_opt_in, whatsapp_phone, phone
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_welcome_whatsapp_on_optin();
