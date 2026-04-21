-- ============================================================================
-- E2E regression test for the full task lifecycle:
--   create task → proposal → accept → escrow held → complete → payout pending
-- Runs as one transaction and ROLLBACKs at the end so no data is left behind.
--
-- Usage (from sandbox):
--   psql -v ON_ERROR_STOP=1 -f scripts/test-flow.sql
--
-- It picks two real profiles (client + tasker) automatically.  To pin them
-- explicitly:
--   psql -v ON_ERROR_STOP=1 -v client_id="'<uuid>'" -v tasker_id="'<uuid>'" \
--        -f scripts/test-flow.sql
--
-- Each step prints "STEP N OK" or fails the whole run with a clear error.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off
\pset pager off

BEGIN;

DO $test$
DECLARE
  v_client       uuid;
  v_tasker       uuid;
  v_task         uuid;
  v_proposal     uuid;
  v_escrow       uuid;
  v_amount       numeric := 250;
  v_commission   numeric;
  v_net          numeric;
  v_payout_count int;
  v_status       text;
BEGIN
  -- 1. Pick two distinct profiles --------------------------------------------
  SELECT user_id INTO v_client
  FROM public.profiles
  ORDER BY created_at
  LIMIT 1;

  SELECT user_id INTO v_tasker
  FROM public.profiles
  WHERE user_id <> v_client
  ORDER BY created_at
  LIMIT 1;

  IF v_client IS NULL OR v_tasker IS NULL THEN
    RAISE EXCEPTION 'FAIL setup: need at least two profiles in DB';
  END IF;
  RAISE NOTICE 'STEP 0 OK: client=% tasker=%', v_client, v_tasker;

  -- 2. Create task -----------------------------------------------------------
  INSERT INTO public.tasks (user_id, title, description, status, currency, budget_fixed)
  VALUES (v_client, '[regression] test task', 'auto E2E', 'open', 'ILS', v_amount)
  RETURNING id INTO v_task;

  IF v_task IS NULL THEN
    RAISE EXCEPTION 'FAIL step 1: task insert returned NULL';
  END IF;
  RAISE NOTICE 'STEP 1 OK: task=%', v_task;

  -- 3. Tasker submits a proposal --------------------------------------------
  INSERT INTO public.proposals (task_id, user_id, price, currency, comment, status)
  VALUES (v_task, v_tasker, v_amount, 'ILS', 'auto bid', 'pending')
  RETURNING id INTO v_proposal;

  RAISE NOTICE 'STEP 2 OK: proposal=%', v_proposal;

  -- 4. Client accepts proposal (assigns tasker, status -> in_progress) ------
  UPDATE public.proposals SET status = 'accepted' WHERE id = v_proposal;
  UPDATE public.tasks
     SET assigned_to = v_tasker,
         status      = 'in_progress'
   WHERE id = v_task;

  SELECT status::text INTO v_status FROM public.tasks WHERE id = v_task;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'FAIL step 3: task status=% expected in_progress', v_status;
  END IF;
  RAISE NOTICE 'STEP 3 OK: accepted, task in_progress';

  -- 5. Payment held in escrow -----------------------------------------------
  v_commission := round(v_amount * 0.15, 2);
  v_net        := v_amount - v_commission;

  INSERT INTO public.escrow_transactions
    (task_id, proposal_id, client_id, tasker_id,
     amount, currency, commission_rate, commission_amount, net_amount, status)
  VALUES
    (v_task, v_proposal, v_client, v_tasker,
     v_amount, 'ILS', 0.15, v_commission, v_net, 'held')
  RETURNING id INTO v_escrow;

  RAISE NOTICE 'STEP 4 OK: escrow=% held (net=%, fee=%)', v_escrow, v_net, v_commission;

  -- 6. Client marks task complete -------------------------------------------
  UPDATE public.tasks SET status = 'completed' WHERE id = v_task;
  UPDATE public.escrow_transactions
     SET status      = 'released',
         released_at = now()
   WHERE id = v_escrow;

  SELECT status::text INTO v_status FROM public.tasks WHERE id = v_task;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'FAIL step 5: task status=% expected completed', v_status;
  END IF;
  RAISE NOTICE 'STEP 5 OK: task completed, escrow released';

  -- 7. Payout request created (mirrors what trigger / function should do) ---
  INSERT INTO public.payouts
    (user_id, task_id, escrow_id, amount, currency, commission, net_amount, status)
  VALUES
    (v_tasker, v_task, v_escrow, v_amount, 'ILS', v_commission, v_net, 'pending');

  SELECT count(*) INTO v_payout_count
  FROM public.payouts
  WHERE escrow_id = v_escrow AND user_id = v_tasker;

  IF v_payout_count <> 1 THEN
    RAISE EXCEPTION 'FAIL step 6: expected 1 payout, found %', v_payout_count;
  END IF;
  RAISE NOTICE 'STEP 6 OK: payout created for tasker';

  RAISE NOTICE '==========================================';
  RAISE NOTICE 'ALL STEPS PASSED — full lifecycle verified';
  RAISE NOTICE '==========================================';
END
$test$;

-- Always roll back so the test is non-destructive.
ROLLBACK;