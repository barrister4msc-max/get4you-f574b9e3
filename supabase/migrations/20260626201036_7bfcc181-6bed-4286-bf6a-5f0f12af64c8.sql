
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

INSERT INTO public.app_settings (key, value, is_public)
VALUES (
  'proposal_created_webhook_url',
  to_jsonb('https://ai.chatbotisrael.com/webhook/whatsapp-workflow/293200.421763.397494.1782504370'::text),
  false
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dispatch_proposal_created_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url           text;
  v_task_title    text;
  v_client_id     uuid;
  v_client_name   text;
  v_tasker_name   text;
  v_payload       jsonb;
  v_request_id    bigint;
  v_already       boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.app_events
    WHERE event_type = 'webhook.proposal_created'
      AND entity_type = 'proposal'
      AND entity_id = NEW.id
  ) INTO v_already;
  IF v_already THEN
    RETURN NEW;
  END IF;

  SELECT (value #>> '{}') INTO v_url
  FROM public.app_settings
  WHERE key = 'proposal_created_webhook_url';

  IF v_url IS NULL OR length(trim(v_url)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT t.title, t.user_id INTO v_task_title, v_client_id
  FROM public.tasks t WHERE t.id = NEW.task_id;

  SELECT display_name INTO v_client_name
  FROM public.profiles WHERE user_id = v_client_id;

  SELECT display_name INTO v_tasker_name
  FROM public.profiles WHERE user_id = NEW.user_id;

  v_payload := jsonb_build_object(
    'event',          'proposal_created',
    'proposal_id',    NEW.id,
    'task_id',        NEW.task_id,
    'task_title',     v_task_title,
    'client_user_id', v_client_id,
    'client_name',    v_client_name,
    'tasker_user_id', NEW.user_id,
    'tasker_name',    v_tasker_name,
    'price',          NEW.price,
    'currency',       COALESCE(NEW.currency, 'USD'),
    'message',        NEW.comment,
    'created_at',     NEW.created_at,
    'source',         'flow4you'
  );

  BEGIN
    SELECT net.http_post(
      url             := v_url,
      body            := v_payload,
      headers         := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    ) INTO v_request_id;

    INSERT INTO public.app_events (event_type, entity_type, entity_id, metadata)
    VALUES (
      'webhook.proposal_created',
      'proposal',
      NEW.id,
      jsonb_build_object('url', v_url, 'request_id', v_request_id, 'payload', v_payload)
    );
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.app_events (event_type, entity_type, entity_id, metadata)
      VALUES (
        'webhook.proposal_failed',
        'proposal',
        NEW.id,
        jsonb_build_object('url', v_url, 'error', SQLERRM, 'payload', v_payload)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dispatch_proposal_created_webhook failure-log failed: %', SQLERRM;
    END;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_proposal_created_webhook ON public.proposals;
CREATE TRIGGER trg_dispatch_proposal_created_webhook
AFTER INSERT ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.dispatch_proposal_created_webhook();
