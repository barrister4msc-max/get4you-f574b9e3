CREATE OR REPLACE FUNCTION public.submit_proposal(
  _task_id uuid,
  _price numeric,
  _currency text DEFAULT 'USD'::text,
  _comment text DEFAULT NULL::text,
  _portfolio_urls text[] DEFAULT NULL::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_new_id uuid;
  v_task_status task_status;
  v_task_owner uuid;
  v_roles text[];
  v_is_executor boolean := false;
  v_is_banned boolean := false;
BEGIN
  SELECT array_agg(role::text) INTO v_roles FROM public.user_roles WHERE user_id = v_user_id;

  IF v_user_id IS NULL THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (NULL, _task_id, _price, _currency, false, 'NOT_AUTHENTICATED', 'auth.uid() is null', v_roles);
    INSERT INTO public.analytics_events (event_name, task_id, metadata)
      VALUES ('proposal_rejected', _task_id, jsonb_build_object('reason','NOT_AUTHENTICATED'));
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.banned_users WHERE user_id = v_user_id) INTO v_is_banned;
  IF v_is_banned THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'USER_BANNED', 'user is banned', v_roles);
    INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
      VALUES ('proposal_rejected', v_user_id, _task_id, jsonb_build_object('reason','USER_BANNED'));
    RAISE EXCEPTION 'USER_BANNED' USING ERRCODE = '42501';
  END IF;

  v_is_executor := COALESCE(v_roles && ARRAY['executor','admin','super_admin']::text[], false);
  IF NOT v_is_executor THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'NOT_EXECUTOR', 'user is not executor', v_roles);
    INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
      VALUES ('proposal_rejected', v_user_id, _task_id, jsonb_build_object('reason','NOT_EXECUTOR','roles', to_jsonb(v_roles)));
    RAISE EXCEPTION 'NOT_EXECUTOR' USING ERRCODE = '42501';
  END IF;

  IF _price IS NULL OR _price <= 0 THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'INVALID_PRICE', 'price must be > 0', v_roles);
    INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
      VALUES ('proposal_rejected', v_user_id, _task_id, jsonb_build_object('reason','INVALID_PRICE'));
    RAISE EXCEPTION 'INVALID_PRICE' USING ERRCODE = '22023';
  END IF;

  SELECT status, user_id INTO v_task_status, v_task_owner FROM public.tasks WHERE id = _task_id;

  IF v_task_status IS NULL THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'TASK_NOT_FOUND', 'task does not exist', v_roles);
    INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
      VALUES ('proposal_rejected', v_user_id, _task_id, jsonb_build_object('reason','TASK_NOT_FOUND'));
    RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_task_owner = v_user_id THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'OWNER_CANNOT_BID', 'task owner cannot bid', v_roles);
    INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
      VALUES ('proposal_rejected', v_user_id, _task_id, jsonb_build_object('reason','OWNER_CANNOT_BID'));
    RAISE EXCEPTION 'OWNER_CANNOT_BID' USING ERRCODE = '42501';
  END IF;

  IF v_task_status <> 'open'::task_status THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles, context)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'TASK_NOT_OPEN', 'task is not open', v_roles, jsonb_build_object('status', v_task_status));
    INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
      VALUES ('proposal_rejected', v_user_id, _task_id, jsonb_build_object('reason','TASK_NOT_OPEN','status', v_task_status));
    RAISE EXCEPTION 'TASK_NOT_OPEN' USING ERRCODE = '22023';
  END IF;

  -- FIX: pg_advisory_xact_lock(bigint, bigint) does not exist.
  -- The two-arg version takes (int, int); use the single-arg bigint version
  -- with a combined hash instead.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(_task_id::text || ':' || v_user_id::text, 0)
  );

  SELECT id INTO v_existing_id FROM public.proposals
    WHERE task_id = _task_id AND user_id = v_user_id
      AND status IN ('pending'::proposal_status, 'accepted'::proposal_status)
    LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, proposal_id, user_roles, context)
      VALUES (v_user_id, _task_id, _price, _currency, true, v_existing_id, v_roles, jsonb_build_object('idempotent', true));
    INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
      VALUES ('proposal_submitted', v_user_id, _task_id, jsonb_build_object('idempotent', true, 'proposal_id', v_existing_id));
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.proposals (task_id, user_id, price, currency, comment, portfolio_urls, status)
    VALUES (_task_id, v_user_id, _price, _currency, _comment, _portfolio_urls, 'pending'::proposal_status)
    RETURNING id INTO v_new_id;

  INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, proposal_id, user_roles)
    VALUES (v_user_id, _task_id, _price, _currency, true, v_new_id, v_roles);
  INSERT INTO public.analytics_events (event_name, user_id, task_id, metadata)
    VALUES ('proposal_submitted', v_user_id, _task_id, jsonb_build_object('proposal_id', v_new_id, 'price', _price, 'currency', _currency));

  RETURN v_new_id;
END;
$function$;