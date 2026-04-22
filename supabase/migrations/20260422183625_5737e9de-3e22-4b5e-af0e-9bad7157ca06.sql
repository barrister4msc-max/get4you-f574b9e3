
CREATE TABLE IF NOT EXISTS public.proposal_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  task_id uuid,
  price numeric,
  currency text,
  success boolean NOT NULL,
  error_code text,
  error_message text,
  proposal_id uuid,
  user_roles text[],
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_attempts_created_at ON public.proposal_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_attempts_user_id ON public.proposal_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_proposal_attempts_task_id ON public.proposal_attempts (task_id);
CREATE INDEX IF NOT EXISTS idx_proposal_attempts_success ON public.proposal_attempts (success);

ALTER TABLE public.proposal_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view proposal attempts" ON public.proposal_attempts;
CREATE POLICY "Admins can view proposal attempts"
  ON public.proposal_attempts
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "No direct inserts on proposal attempts" ON public.proposal_attempts;
CREATE POLICY "No direct inserts on proposal attempts"
  ON public.proposal_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP FUNCTION IF EXISTS public.submit_proposal(uuid, numeric, text, text, text[]);

CREATE OR REPLACE FUNCTION public.submit_proposal(
  _task_id uuid,
  _price numeric,
  _currency text DEFAULT 'USD',
  _comment text DEFAULT NULL,
  _portfolio_urls text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_new_id uuid;
  v_task_status task_status;
  v_task_owner uuid;
  v_roles text[];
  v_err_code text;
  v_err_msg text;
BEGIN
  SELECT array_agg(role::text) INTO v_roles FROM public.user_roles WHERE user_id = v_user_id;

  IF v_user_id IS NULL THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (NULL, _task_id, _price, _currency, false, 'NOT_AUTHENTICATED', 'auth.uid() is null', v_roles);
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF _price IS NULL OR _price <= 0 THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'INVALID_PRICE', 'price must be > 0', v_roles);
    RAISE EXCEPTION 'Price must be greater than zero' USING ERRCODE = '22023';
  END IF;

  SELECT status, user_id INTO v_task_status, v_task_owner FROM public.tasks WHERE id = _task_id;

  IF v_task_status IS NULL THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'TASK_NOT_FOUND', 'task does not exist', v_roles);
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_task_owner = v_user_id THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'OWNER_CANNOT_BID', 'task owner cannot bid', v_roles);
    RAISE EXCEPTION 'Cannot submit proposal for your own task' USING ERRCODE = '42501';
  END IF;

  IF v_task_status <> 'open'::task_status THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles, context)
      VALUES (v_user_id, _task_id, _price, _currency, false, 'TASK_NOT_OPEN', 'task is not open', v_roles, jsonb_build_object('status', v_task_status));
    RAISE EXCEPTION 'Task is not open for proposals' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_task_id::text, 0),
    hashtextextended(v_user_id::text, 0)
  );

  SELECT id INTO v_existing_id FROM public.proposals
    WHERE task_id = _task_id AND user_id = v_user_id
      AND status IN ('pending'::proposal_status, 'accepted'::proposal_status)
    LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, proposal_id, user_roles, context)
      VALUES (v_user_id, _task_id, _price, _currency, true, v_existing_id, v_roles, jsonb_build_object('idempotent', true));
    RETURN v_existing_id;
  END IF;

  BEGIN
    INSERT INTO public.proposals (task_id, user_id, price, currency, comment, portfolio_urls, status)
      VALUES (_task_id, v_user_id, _price, _currency, _comment, _portfolio_urls, 'pending'::proposal_status)
      RETURNING id INTO v_new_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, error_code, error_message, user_roles)
      VALUES (v_user_id, _task_id, _price, _currency, false, v_err_code, v_err_msg, v_roles);
    RAISE;
  END;

  INSERT INTO public.proposal_attempts (user_id, task_id, price, currency, success, proposal_id, user_roles)
    VALUES (v_user_id, _task_id, _price, _currency, true, v_new_id, v_roles);

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_proposal(uuid, numeric, text, text, text[]) TO authenticated;
