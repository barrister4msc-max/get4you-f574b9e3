
-- Add dedupe_key to telegram_queue (additive)
ALTER TABLE public.telegram_queue ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_queue_dedupe_key_uniq
  ON public.telegram_queue (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Rate limit table for telegram link code requests
CREATE TABLE IF NOT EXISTS public.telegram_link_code_rl (
  user_id uuid NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id)
);
ALTER TABLE public.telegram_link_code_rl ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_link_code_rl' AND policyname='telegram_link_code_rl_service_all') THEN
    CREATE POLICY telegram_link_code_rl_service_all ON public.telegram_link_code_rl FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
