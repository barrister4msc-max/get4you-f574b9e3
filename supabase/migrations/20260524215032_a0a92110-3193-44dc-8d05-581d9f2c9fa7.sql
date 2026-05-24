-- Helper: safely enqueue a telegram event. Tester-only gate. Fail-safe.
CREATE OR REPLACE FUNCTION public.enqueue_telegram_event(
  p_user_id uuid,
  p_event text,
  p_dedupe_key text,
  p_text text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_enabled boolean;
  v_testers jsonb;
  v_in_testers boolean;
  v_chat_id text;
  v_opt_in boolean;
BEGIN
  IF p_user_id IS NULL OR p_event IS NULL OR p_dedupe_key IS NULL THEN
    RETURN;
  END IF;

  -- Read feature flag (default off / empty)
  SELECT value INTO v_settings FROM public.app_settings WHERE key = 'telegram';
  v_enabled := COALESCE((v_settings->>'enabled')::boolean, false);
  v_testers := COALESCE(v_settings->'test_user_ids', '[]'::jsonb);
  v_in_testers := EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_testers) AS t(uid)
    WHERE t.uid = p_user_id::text
  );

  -- Tester-only rollout: must be globally enabled OR user must be in tester list.
  IF NOT v_enabled AND NOT v_in_testers THEN
    INSERT INTO public.app_events (event_type, actor_id, entity_id, metadata)
    VALUES ('telegram.skipped', p_user_id, p_user_id,
            jsonb_build_object('event', p_event, 'dedupe_key', p_dedupe_key, 'reason', 'not_tester'));
    RETURN;
  END IF;

  -- Must have linked chat + opt-in
  SELECT telegram_chat_id, telegram_opt_in
    INTO v_chat_id, v_opt_in
  FROM public.profiles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_chat_id IS NULL OR COALESCE(v_opt_in, false) = false THEN
    INSERT INTO public.app_events (event_type, actor_id, entity_id, metadata)
    VALUES ('telegram.skipped', p_user_id, p_user_id,
            jsonb_build_object('event', p_event, 'dedupe_key', p_dedupe_key,
                               'reason', CASE WHEN v_chat_id IS NULL THEN 'no_chat_id' ELSE 'not_opted_in' END));
    RETURN;
  END IF;

  INSERT INTO public.telegram_queue (user_id, chat_id, event, payload, dedupe_key)
  VALUES (
    p_user_id,
    v_chat_id,
    p_event,
    jsonb_build_object('text', p_text) || COALESCE(p_payload, '{}'::jsonb),
    p_dedupe_key
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  INSERT INTO public.app_events (event_type, actor_id, entity_id, metadata)
  VALUES ('telegram.enqueued', p_user_id, p_user_id,
          jsonb_build_object('event', p_event, 'dedupe_key', p_dedupe_key));

EXCEPTION WHEN OTHERS THEN
  -- Never propagate telegram errors to caller (payments/orders/escrow must continue)
  BEGIN
    INSERT INTO public.app_events (event_type, actor_id, entity_id, metadata)
    VALUES ('telegram.failed', p_user_id, p_user_id,
            jsonb_build_object('event', p_event, 'dedupe_key', p_dedupe_key,
                               'error', SQLERRM, 'sqlstate', SQLSTATE));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_telegram_event(uuid, text, text, text, jsonb) FROM PUBLIC;

-- ============================================================
-- Trigger: proposal accepted -> notify the tasker (proposal.user_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_telegram_proposal_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title text;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      SELECT title INTO v_task_title FROM public.tasks WHERE id = NEW.task_id;

      PERFORM public.enqueue_telegram_event(
        NEW.user_id,
        'proposal_accepted',
        'proposal_accepted:' || NEW.id::text,
        'Your proposal was accepted' ||
          CASE WHEN v_task_title IS NOT NULL THEN ': ' || v_task_title ELSE '' END ||
          E'\nOpen: https://4you.ai/dashboard',
        jsonb_build_object('task_id', NEW.task_id, 'proposal_id', NEW.id,
                           'url', 'https://4you.ai/dashboard')
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- never block proposal updates
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_telegram_proposal_accepted ON public.proposals;
CREATE TRIGGER trg_telegram_proposal_accepted
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.tg_telegram_proposal_accepted();

-- ============================================================
-- Trigger: order paid -> notify the client (orders.user_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_telegram_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      PERFORM public.enqueue_telegram_event(
        NEW.user_id,
        'order_paid',
        'order_paid:' || NEW.id::text,
        'Payment received. Your order is confirmed.' ||
          E'\nOpen: https://4you.ai/dashboard',
        jsonb_build_object('order_id', NEW.id, 'task_id', NEW.task_id,
                           'url', 'https://4you.ai/dashboard')
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_telegram_order_paid ON public.orders;
CREATE TRIGGER trg_telegram_order_paid
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.tg_telegram_order_paid();

-- ============================================================
-- Trigger: escrow released -> notify the tasker
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_telegram_escrow_released()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'released' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      PERFORM public.enqueue_telegram_event(
        NEW.tasker_id,
        'escrow_released',
        'escrow_released:' || NEW.id::text,
        'Funds have been released for your completed task.' ||
          E'\nOpen: https://4you.ai/dashboard',
        jsonb_build_object('escrow_id', NEW.id, 'task_id', NEW.task_id,
                           'url', 'https://4you.ai/dashboard')
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_telegram_escrow_released ON public.escrow_transactions;
CREATE TRIGGER trg_telegram_escrow_released
AFTER UPDATE OF status ON public.escrow_transactions
FOR EACH ROW
EXECUTE FUNCTION public.tg_telegram_escrow_released();