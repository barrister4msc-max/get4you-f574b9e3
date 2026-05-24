
-- Profile columns for Telegram (additive, nullable, default off)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS telegram_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_chat_id_key
  ON public.profiles(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- Link codes: short-lived codes user pastes to bot to link account
CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  code        TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS telegram_link_codes_user_idx
  ON public.telegram_link_codes(user_id);

ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own link codes" ON public.telegram_link_codes;
CREATE POLICY "Users can view own link codes"
  ON public.telegram_link_codes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages link codes" ON public.telegram_link_codes;
CREATE POLICY "Service role manages link codes"
  ON public.telegram_link_codes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Outbound queue (same shape as whatsapp_queue)
CREATE TABLE IF NOT EXISTS public.telegram_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  chat_id         BIGINT,
  event           TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_queue_status_idx
  ON public.telegram_queue(status, next_attempt_at);

ALTER TABLE public.telegram_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read telegram queue" ON public.telegram_queue;
CREATE POLICY "Admins read telegram queue"
  ON public.telegram_queue FOR SELECT TO authenticated
  USING (is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages telegram queue" ON public.telegram_queue;
CREATE POLICY "Service role manages telegram queue"
  ON public.telegram_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Delivery logs (same shape as whatsapp_logs)
CREATE TABLE IF NOT EXISTS public.telegram_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  chat_id     BIGINT,
  event       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  message_id  BIGINT,
  error       TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS telegram_logs_user_idx ON public.telegram_logs(user_id, created_at DESC);

ALTER TABLE public.telegram_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read telegram logs" ON public.telegram_logs;
CREATE POLICY "Admins read telegram logs"
  ON public.telegram_logs FOR SELECT TO authenticated
  USING (is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages telegram logs" ON public.telegram_logs;
CREATE POLICY "Service role manages telegram logs"
  ON public.telegram_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Feature flag seed (default OFF). Admins can edit via app_settings policy.
INSERT INTO public.app_settings (key, value, is_public)
VALUES ('telegram', '{"enabled": false, "bot_username": null}'::jsonb, false)
ON CONFLICT (key) DO NOTHING;
