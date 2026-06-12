
-- Replace normalize_phone_e164 with IL/CY-aware E.164 normalizer.
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $function$
declare
  raw text;
  has_plus boolean;
  digits text;
  local_il text;
  local_cy text;
begin
  if p_phone is null then
    return null;
  end if;

  raw := trim(p_phone);
  if length(raw) = 0 then return null; end if;

  has_plus := left(raw, 1) = '+';
  digits := regexp_replace(raw, '[^0-9]', '', 'g');
  if length(digits) = 0 then return null; end if;

  -- Israel
  if (has_plus and left(digits, 3) = '972') or left(digits, 3) = '972' then
    local_il := substring(digits from 4);
  elsif left(digits, 1) = '0' then
    local_il := substring(digits from 2);
  elsif length(digits) = 9 and left(digits, 1) = '5' then
    local_il := digits;
  else
    local_il := null;
  end if;

  if local_il is not null then
    if local_il ~ '^5[0-9]{8}$' then
      return '+972' || local_il;
    elsif local_il ~ '^[23489][0-9]{7}$' then
      return '+972' || local_il;
    end if;
  end if;

  -- Cyprus
  if (has_plus and left(digits, 3) = '357') or left(digits, 3) = '357' then
    local_cy := substring(digits from 4);
  elsif length(digits) = 8 then
    local_cy := digits;
  else
    local_cy := null;
  end if;

  if local_cy is not null and local_cy ~ '^[29][0-9]{7}$' then
    return '+357' || local_cy;
  end if;

  return null;
end;
$function$;

-- enqueue_whatsapp: normalize before insert, log failed row if invalid.
CREATE OR REPLACE FUNCTION public.enqueue_whatsapp(p_user_id uuid, p_event_type text, p_task_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_phone text;
  v_norm text;
  v_opt_in boolean;
  v_id uuid;
begin
  if p_user_id is null then return null; end if;

  select coalesce(whatsapp_phone, phone), coalesce(whatsapp_opt_in, false)
    into v_phone, v_opt_in
  from public.profiles where user_id = p_user_id;

  if not v_opt_in then return null; end if;
  if v_phone is null or length(trim(v_phone)) = 0 then return null; end if;

  if exists (
    select 1 from public.whatsapp_logs
    where target_user_id = p_user_id
      and event_type = p_event_type
      and coalesce(task_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_task_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and created_at > now() - interval '60 seconds'
  ) then
    return null;
  end if;

  v_norm := public.normalize_phone_e164(v_phone);

  if v_norm is null then
    insert into public.whatsapp_logs (target_user_id, phone, event_type, task_id, status, metadata, error_message)
    values (p_user_id, v_phone, p_event_type, p_task_id, 'failed', coalesce(p_metadata,'{}'::jsonb), 'invalid_phone')
    returning id into v_id;
    return v_id;
  end if;

  insert into public.whatsapp_logs (target_user_id, phone, event_type, task_id, status, metadata)
  values (p_user_id, v_norm, p_event_type, p_task_id, 'pending', coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$function$;
