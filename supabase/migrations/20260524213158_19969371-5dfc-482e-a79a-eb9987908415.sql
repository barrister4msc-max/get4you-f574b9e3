
ALTER TABLE public.profiles
  ALTER COLUMN telegram_chat_id TYPE text USING telegram_chat_id::text;

ALTER TABLE public.telegram_queue
  ALTER COLUMN chat_id TYPE text USING chat_id::text;

ALTER TABLE public.telegram_logs
  ALTER COLUMN chat_id TYPE text USING chat_id::text;
