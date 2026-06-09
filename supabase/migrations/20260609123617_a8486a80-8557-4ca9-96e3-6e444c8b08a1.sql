
-- 1) Available balance for a tasker
CREATE OR REPLACE FUNCTION public.tasker_available_balance(_user_id uuid)
RETURNS TABLE(available numeric, currency text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(p.net_amount), 0)::numeric AS available,
         COALESCE(MAX(p.currency), 'ILS') AS currency
  FROM public.payouts p
  WHERE p.user_id = _user_id
    AND p.status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM public.withdrawal_request_payouts wrp
      JOIN public.withdrawal_requests wr ON wr.id = wrp.withdrawal_request_id
      WHERE wrp.payout_id = p.id
        AND wr.status IN ('pending', 'processing', 'paid')
    );
$$;

GRANT EXECUTE ON FUNCTION public.tasker_available_balance(uuid) TO authenticated, service_role;

-- 2) Create a withdrawal request atomically
CREATE OR REPLACE FUNCTION public.request_withdrawal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _account public.payout_accounts%ROWTYPE;
  _has_agreement boolean;
  _has_open boolean;
  _request_id uuid;
  _total numeric := 0;
  _currency text := 'ILS';
  _payout RECORD;
  _count int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.contractor_agreements WHERE user_id = _uid)
  INTO _has_agreement;
  IF NOT _has_agreement THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'agreement_missing');
  END IF;

  SELECT * INTO _account FROM public.payout_accounts WHERE user_id = _uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_missing');
  END IF;
  IF _account.status = 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_pending');
  END IF;
  IF _account.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_rejected');
  END IF;
  IF _account.status <> 'verified' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_not_verified');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.withdrawal_requests
    WHERE user_id = _uid AND status IN ('pending', 'processing')
  ) INTO _has_open;
  IF _has_open THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'open_request_exists');
  END IF;

  -- Lock the available payouts
  SELECT COALESCE(SUM(net_amount), 0), COALESCE(MAX(currency), 'ILS')
  INTO _total, _currency
  FROM public.payouts p
  WHERE p.user_id = _uid
    AND p.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.withdrawal_request_payouts wrp
      JOIN public.withdrawal_requests wr ON wr.id = wrp.withdrawal_request_id
      WHERE wrp.payout_id = p.id AND wr.status IN ('pending', 'processing', 'paid')
    );

  IF _total <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_balance');
  END IF;

  INSERT INTO public.withdrawal_requests(user_id, payout_account_id, amount, currency, status)
  VALUES (_uid, _account.id, _total, _currency, 'pending')
  RETURNING id INTO _request_id;

  FOR _payout IN
    SELECT p.id, p.net_amount
    FROM public.payouts p
    WHERE p.user_id = _uid
      AND p.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM public.withdrawal_request_payouts wrp
        JOIN public.withdrawal_requests wr ON wr.id = wrp.withdrawal_request_id
        WHERE wrp.payout_id = p.id AND wr.status IN ('pending', 'processing', 'paid')
      )
  LOOP
    INSERT INTO public.withdrawal_request_payouts(withdrawal_request_id, payout_id, amount)
    VALUES (_request_id, _payout.id, _payout.net_amount);
    _count := _count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'withdrawal_request_id', _request_id,
    'amount', _total,
    'currency', _currency,
    'payouts_linked', _count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal() TO authenticated;

-- 3) Admin audit logger (admin/super_admin only)
CREATE OR REPLACE FUNCTION public.log_admin_payout_action(
  _action text,
  _target_type text,
  _target_id text,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin_or_superadmin(_uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.admin_audit_log(actor_id, action, target_type, target_id, details)
  VALUES (_uid, _action, _target_type, _target_id, COALESCE(_details, '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_admin_payout_action(text, text, text, jsonb) TO authenticated;
