-- =========================================================
-- Payment reconciliation layer (read-only, admin-only)
-- =========================================================

-- Drop if re-running
drop view if exists public.payment_reconciliation cascade;

create view public.payment_reconciliation
with (security_invoker = true)
as
with
  task_escrow_counts as (
    select task_id, count(*)::int as escrow_count
    from public.escrow_transactions
    where task_id is not null
    group by task_id
  ),
  task_paid_order_counts as (
    select task_id, count(*)::int as paid_order_count
    from public.orders
    where task_id is not null and status = 'paid'
    group by task_id
  ),
  base as (
    select
      o.id                       as order_id,
      o.status                   as order_status,
      o.amount                   as order_amount,
      o.currency                 as order_currency,
      o.task_id                  as order_task_id,
      o.proposal_id              as order_proposal_id,
      o.user_id                  as order_user_id,
      o.created_at               as order_created_at,

      e.id                       as escrow_id,
      e.status                   as escrow_status,
      e.amount                   as escrow_amount,
      e.net_amount               as escrow_net_amount,
      e.task_id                  as escrow_task_id,
      e.proposal_id              as escrow_proposal_id,
      e.tasker_id                as escrow_tasker_id,
      e.client_id                as escrow_client_id,
      e.released_at              as escrow_released_at,

      p.id                       as payout_id,
      p.status                   as payout_status,
      p.amount                   as payout_amount,
      p.net_amount               as payout_net_amount,
      p.user_id                  as payout_user_id,
      p.escrow_id                as payout_escrow_id,
      p.task_id                  as payout_task_id,

      t.id                       as task_id,
      t.status                   as task_status,
      t.assigned_to              as assigned_to,
      pr.id                      as proposal_id,
      pr.status                  as proposal_status,

      coalesce(tec.escrow_count, 0)       as escrow_count_for_task,
      coalesce(tpc.paid_order_count, 0)   as paid_order_count_for_task
    from public.orders o
    full outer join public.escrow_transactions e
      on e.task_id = o.task_id
     and e.proposal_id = o.proposal_id
    full outer join public.payouts p
      on p.escrow_id = e.id
    left join public.tasks t
      on t.id = coalesce(o.task_id, e.task_id, p.task_id)
    left join public.proposals pr
      on pr.id = coalesce(o.proposal_id, e.proposal_id)
    left join task_escrow_counts tec
      on tec.task_id = coalesce(o.task_id, e.task_id, p.task_id)
    left join task_paid_order_counts tpc
      on tpc.task_id = coalesce(o.task_id, e.task_id, p.task_id)
  )
select
  order_id,
  order_status,
  order_amount,
  order_currency,
  order_created_at,
  escrow_id,
  escrow_status,
  escrow_amount,
  escrow_net_amount,
  escrow_released_at,
  payout_id,
  payout_status,
  payout_amount,
  payout_net_amount,
  task_id,
  task_status,
  proposal_id,
  proposal_status,
  assigned_to,
  escrow_count_for_task,
  paid_order_count_for_task,
  case
    when order_status = 'paid' and escrow_id is null
      then 'paid_order_without_escrow'
    when escrow_status = 'released' and payout_id is null
      then 'released_escrow_without_payout'
    when payout_id is not null and (escrow_id is null or escrow_status <> 'released')
      then 'payout_without_released_escrow'
    when task_status in ('in_progress','completed') and escrow_id is null
      then 'task_active_without_escrow'
    when escrow_count_for_task > 1
      then 'multiple_escrows_per_task'
    when paid_order_count_for_task > 1
      then 'multiple_paid_orders_per_task'
    when order_id is not null and escrow_id is not null
         and order_amount is not null and escrow_amount is not null
         and round(order_amount::numeric, 2) <> round(escrow_amount::numeric, 2)
      then 'amount_mismatch_order_escrow'
    when payout_id is not null and escrow_id is not null
         and escrow_net_amount is not null and payout_net_amount is not null
         and round(escrow_net_amount::numeric, 2) <> round(payout_net_amount::numeric, 2)
      then 'amount_mismatch_escrow_payout'
    when payout_id is not null and escrow_id is null and order_id is null
      then 'orphan_payout'
    when escrow_id is not null and order_id is null
      then 'orphan_escrow'
    else null
  end as mismatch_reason
from base;

comment on view public.payment_reconciliation is
  'Admin-only reconciliation view across orders, escrow_transactions, payouts, tasks, proposals. mismatch_reason flags financial inconsistencies.';

revoke all on public.payment_reconciliation from public, anon, authenticated;
grant select on public.payment_reconciliation to postgres;

-- =========================================================
-- Summary function (admin only)
-- =========================================================
create or replace function public.get_payment_reconciliation_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_summary jsonb;
  v_by_type jsonb;
begin
  if not public.is_admin_or_superadmin(auth.uid()) then
    raise exception 'forbidden: admin only';
  end if;

  select coalesce(jsonb_object_agg(mismatch_reason, cnt), '{}'::jsonb)
    into v_by_type
  from (
    select mismatch_reason, count(*)::int as cnt
    from public.payment_reconciliation
    where mismatch_reason is not null
    group by mismatch_reason
  ) s;

  select jsonb_build_object(
    'total_paid_orders',
      (select count(*) from public.orders where status = 'paid'),
    'total_held_escrow',
      (select count(*) from public.escrow_transactions where status = 'held'),
    'total_released_escrow',
      (select count(*) from public.escrow_transactions where status = 'released'),
    'total_pending_payouts',
      (select count(*) from public.payouts where status = 'pending'),
    'total_mismatches',
      (select count(*) from public.payment_reconciliation where mismatch_reason is not null),
    'mismatches_by_type', v_by_type,
    'generated_at', now()
  )
  into v_summary;

  return v_summary;
end;
$$;

revoke all on function public.get_payment_reconciliation_summary() from public, anon, authenticated;
grant execute on function public.get_payment_reconciliation_summary() to authenticated;