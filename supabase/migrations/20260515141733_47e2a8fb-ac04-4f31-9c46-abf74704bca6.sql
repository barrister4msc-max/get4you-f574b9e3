
-- 1) New tracking columns
ALTER TABLE public.whatsapp_logs
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS undelivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_callback_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_error_code text;

CREATE INDEX IF NOT EXISTS whatsapp_logs_provider_message_id_idx
  ON public.whatsapp_logs (provider_message_id);

-- 2) Default retry config in app_settings (idempotent)
INSERT INTO public.app_settings (key, value, is_public)
VALUES (
  'whatsapp_retry',
  jsonb_build_object('max_retries', 5, 'backoff_minutes', jsonb_build_array(1,5,15,60,240)),
  false
)
ON CONFLICT (key) DO NOTHING;

-- 3) Updated claim function — reads max_retries from settings
CREATE OR REPLACE FUNCTION public.claim_pending_whatsapp_messages(p_limit integer DEFAULT 20)
RETURNS SETOF public.whatsapp_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE((value->>'max_retries')::int, 5) INTO v_max
    FROM public.app_settings WHERE key = 'whatsapp_retry';
  v_max := COALESCE(v_max, 5);

  RETURN QUERY
  WITH picked AS (
    SELECT id
      FROM public.whatsapp_logs
     WHERE status IN ('pending','failed')
       AND (next_retry_at IS NULL OR next_retry_at <= now())
       AND retry_count < v_max
     ORDER BY created_at ASC
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_logs w
     SET status = 'processing',
         claimed_at = now()
    FROM picked
   WHERE w.id = picked.id
  RETURNING w.*;
END;
$function$;

-- 4) Updated mark_whatsapp_failed — reads backoff array + max from settings; uses 'dead' on terminal
CREATE OR REPLACE FUNCTION public.mark_whatsapp_failed(p_log_id uuid, p_error_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_retry int;
  v_max int;
  v_backoff jsonb;
  v_minutes int;
  v_final boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE((value->>'max_retries')::int, 5),
         COALESCE(value->'backoff_minutes', '[1,5,15,60,240]'::jsonb)
    INTO v_max, v_backoff
    FROM public.app_settings WHERE key = 'whatsapp_retry';
  v_max := COALESCE(v_max, 5);
  v_backoff := COALESCE(v_backoff, '[1,5,15,60,240]'::jsonb);

  SELECT retry_count + 1 INTO v_new_retry
    FROM public.whatsapp_logs WHERE id = p_log_id;

  v_final := v_new_retry >= v_max;

  -- pick backoff[v_new_retry-1] or last entry
  IF jsonb_array_length(v_backoff) = 0 THEN
    v_minutes := 5;
  ELSIF v_new_retry - 1 < jsonb_array_length(v_backoff) THEN
    v_minutes := (v_backoff->> (v_new_retry - 1))::int;
  ELSE
    v_minutes := (v_backoff->> (jsonb_array_length(v_backoff) - 1))::int;
  END IF;

  UPDATE public.whatsapp_logs
     SET status = CASE WHEN v_final THEN 'dead' ELSE 'failed' END,
         retry_count = v_new_retry,
         error_message = p_error_message,
         failed_at = now(),
         next_retry_at = CASE WHEN v_final THEN NULL
                              ELSE now() + make_interval(mins => v_minutes) END
   WHERE id = p_log_id;
END;
$function$;

-- 5) Webhook RPC — called from twilio-status-webhook edge function
CREATE OR REPLACE FUNCTION public.mark_whatsapp_delivery(
  p_provider_message_id text,
  p_status text,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log_id uuid;
  v_norm text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_log_id
    FROM public.whatsapp_logs
   WHERE provider_message_id = p_provider_message_id
   LIMIT 1;
  IF v_log_id IS NULL THEN RETURN; END IF;

  v_norm := lower(coalesce(p_status, ''));

  UPDATE public.whatsapp_logs
     SET delivery_status = v_norm,
         last_callback_at = now(),
         provider_error_code = COALESCE(p_error_code, provider_error_code),
         delivered_at = CASE WHEN v_norm = 'delivered' THEN now() ELSE delivered_at END,
         read_at      = CASE WHEN v_norm = 'read' THEN now() ELSE read_at END,
         undelivered_at = CASE WHEN v_norm IN ('undelivered','failed') THEN now() ELSE undelivered_at END
   WHERE id = v_log_id;

  -- If terminal Twilio failure → re-queue via mark_whatsapp_failed (respects max retries)
  IF v_norm IN ('undelivered','failed') THEN
    PERFORM public.mark_whatsapp_failed(
      v_log_id,
      'Twilio ' || v_norm ||
        CASE WHEN p_error_code IS NOT NULL THEN ' (' || p_error_code || ')' ELSE '' END ||
        CASE WHEN p_error_message IS NOT NULL THEN ': ' || p_error_message ELSE '' END
    );
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_whatsapp_delivery(text,text,text,text) FROM public, anon, authenticated;
