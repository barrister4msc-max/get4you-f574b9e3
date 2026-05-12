CREATE OR REPLACE FUNCTION public.finalize_paid_order(p_order_id uuid, p_provider_payment_id text DEFAULT NULL::text, p_provider_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_task public.tasks%rowtype;
  v_proposal public.proposals%rowtype;
  v_escrow_id uuid;
  v_commission_rate numeric := 0.15;
  v_commission_amount numeric;
  v_net_amount numeric;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.task_id is null then
    raise exception 'ORDER_TASK_ID_IS_NULL';
  end if;

  if v_order.proposal_id is null then
    raise exception 'ORDER_PROPOSAL_ID_IS_NULL';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_order.task_id::text));

  select *
  into v_task
  from public.tasks
  where id = v_order.task_id
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;

  select *
  into v_proposal
  from public.proposals
  where id = v_order.proposal_id
  for update;

  if not found then
    raise exception 'PROPOSAL_NOT_FOUND';
  end if;

  if v_proposal.task_id <> v_order.task_id then
    raise exception 'PROPOSAL_DOES_NOT_BELONG_TO_TASK';
  end if;

  select id
  into v_escrow_id
  from public.escrow_transactions
  where task_id = v_order.task_id
    and status in ('held', 'released')
  limit 1;

  if v_order.status = 'paid' and v_escrow_id is not null then
    return jsonb_build_object(
      'ok', true,
      'already_finalized', true,
      'order_id', v_order.id,
      'escrow_id', v_escrow_id
    );
  end if;

  update public.orders
  set
    status = 'paid',
    provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
    provider_status = coalesce(p_provider_status, provider_status),
    updated_at = now()
  where id = v_order.id;

  update public.proposals
  set
    status = 'accepted',
    updated_at = now()
  where id = v_order.proposal_id;

  update public.proposals
  set
    status = 'rejected',
    updated_at = now()
  where task_id = v_order.task_id
    and id <> v_order.proposal_id
    and status = 'pending';

  update public.tasks
  set
    status = 'in_progress',
    assigned_to = v_proposal.user_id,
    updated_at = now()
  where id = v_order.task_id;

  if v_escrow_id is null then
    v_commission_amount := round((v_order.amount * v_commission_rate)::numeric, 2);
    v_net_amount := v_order.amount - v_commission_amount;

    insert into public.escrow_transactions (
      order_id,
      task_id,
      proposal_id,
      client_id,
      tasker_id,
      amount,
      currency,
      commission_rate,
      commission_amount,
      net_amount,
      status,
      provider,
      provider_order_id,
      provider_payment_id,
      provider_status,
      payment_confirmed_at
    )
    values (
      v_order.id,
      v_order.task_id,
      v_order.proposal_id,
      v_order.user_id,
      v_proposal.user_id,
      v_order.amount,
      coalesce(v_order.currency, 'ILS'),
      v_commission_rate,
      v_commission_amount,
      v_net_amount,
      'held',
      coalesce(v_order.provider, 'allpay'),
      coalesce(v_order.provider_order_id, v_order.allpay_order_id),
      coalesce(p_provider_payment_id, v_order.provider_payment_id),
      coalesce(p_provider_status, v_order.provider_status),
      now()
    )
    returning id into v_escrow_id;
  end if;

  insert into public.app_events (
    actor_id,
    event_type,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  values (
    v_order.user_id,
    'payment.finalized',
    'order',
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'task_id', v_order.task_id,
      'proposal_id', v_order.proposal_id,
      'escrow_id', v_escrow_id
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'task_id', v_order.task_id,
    'proposal_id', v_order.proposal_id,
    'escrow_id', v_escrow_id
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.finalize_paid_order(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_paid_order(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_paid_order(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_order(uuid, text, text) TO service_role;
