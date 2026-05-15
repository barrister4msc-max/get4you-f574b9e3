
-- Add queue management columns to whatsapp_logs
ALTER TABLE public.whatsapp_logs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Index to speed up worker scans
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status_next_retry
  ON public.whatsapp_logs (status, next_retry_at)
  WHERE status IN ('pending','failed','processing');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_whatsapp_logs_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_logs_touch ON public.whatsapp_logs;
CREATE TRIGGER trg_whatsapp_logs_touch
BEFORE UPDATE ON public.whatsapp_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_whatsapp_logs_touch();

-- claim_pending_whatsapp_messages: lock-and-claim a batch
CREATE OR REPLACE FUNCTION public.claim_pending_whatsapp_messages(p_limit int DEFAULT 20)
RETURNS SETOF public.whatsapp_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.whatsapp_logs
    WHERE status IN ('pending','failed')
      AND (next_retry_at IS NULL OR next_retry_at <= now())
      AND retry_count < 5
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
$$;

REVOKE ALL ON FUNCTION public.claim_pending_whatsapp_messages(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_whatsapp_messages(int) TO service_role;

-- mark_whatsapp_sent
CREATE OR REPLACE FUNCTION public.mark_whatsapp_sent(p_log_id uuid, p_provider_message_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.whatsapp_logs
     SET status = 'sent',
         sent_at = now(),
         provider_message_id = p_provider_message_id,
         error_message = NULL,
         next_retry_at = NULL
   WHERE id = p_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_whatsapp_sent(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_whatsapp_sent(uuid, text) TO service_role;

-- mark_whatsapp_failed: bumps retry_count and schedules next attempt with exponential backoff
CREATE OR REPLACE FUNCTION public.mark_whatsapp_failed(p_log_id uuid, p_error_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_retry int;
  v_backoff_minutes int;
  v_final boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT retry_count + 1 INTO v_new_retry
    FROM public.whatsapp_logs WHERE id = p_log_id;

  v_final := v_new_retry >= 5;
  v_backoff_minutes := LEAST(60, power(2, v_new_retry)::int);

  UPDATE public.whatsapp_logs
     SET status = CASE WHEN v_final THEN 'failed' ELSE 'failed' END,
         retry_count = v_new_retry,
         error_message = p_error_message,
         failed_at = now(),
         next_retry_at = CASE WHEN v_final THEN NULL ELSE now() + make_interval(mins => v_backoff_minutes) END
   WHERE id = p_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_whatsapp_failed(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_whatsapp_failed(uuid, text) TO service_role;
