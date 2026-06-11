
CREATE OR REPLACE FUNCTION public.notify_welcome_whatsapp_on_optin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_phone text;
  v_lang text;
  v_msg text;
  v_exists boolean;
begin
  -- Fire only when opt-in flips to true and a phone is now present
  if coalesce(NEW.whatsapp_opt_in, false) = true
     and coalesce(OLD.whatsapp_opt_in, false) = false then
    v_phone := coalesce(NEW.whatsapp_phone, NEW.phone);
    if v_phone is null or length(trim(v_phone)) = 0 then
      return NEW;
    end if;

    -- Skip if a welcome was already enqueued/sent for this user
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
  end if;
  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_welcome_whatsapp_on_optin ON public.profiles;
CREATE TRIGGER trg_welcome_whatsapp_on_optin
AFTER UPDATE OF whatsapp_opt_in, whatsapp_phone ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.notify_welcome_whatsapp_on_optin();

-- Backfill: enqueue welcome for already opted-in users who never got one
DO $$
declare r record;
begin
  for r in
    select p.user_id, p.whatsapp_phone, p.phone, coalesce(p.preferred_language,'en') as lang
    from public.profiles p
    where coalesce(p.whatsapp_opt_in,false) = true
      and coalesce(p.whatsapp_phone, p.phone) is not null
      and not exists (
        select 1 from public.whatsapp_logs w
        where w.target_user_id = p.user_id and w.event_type = 'welcome'
      )
  loop
    perform public.enqueue_whatsapp(
      r.user_id, 'welcome', null,
      jsonb_build_object(
        'message',
        case lower(r.lang)
          when 'ru' then 'Добро пожаловать в Flow4You! Ваш аккаунт успешно создан.'
          when 'he' then 'ברוכים הבאים ל-Flow4You! החשבון שלך נוצר בהצלחה.'
          else 'Welcome to Flow4You! Your account has been created successfully.'
        end,
        'language', r.lang
      )
    );
  end loop;
end $$;
