create extension if not exists pg_cron;

create or replace function public.cleanup_stale_orders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set
    status = 'cancelled',
    provider_status = 'expired_cleanup',
    updated_at = now()
  where status = 'pending'
    and created_at < now() - interval '24 hours';

  insert into public.app_events (
    event_type,
    entity_type,
    metadata
  )
  values (
    'orders.cleanup',
    'system',
    jsonb_build_object(
      'executed_at', now(),
      'type', 'pending_orders_cleanup'
    )
  );
end;
$$;

revoke all on function public.cleanup_stale_orders() from public;
grant execute on function public.cleanup_stale_orders() to postgres;

select cron.schedule(
  'cleanup-stale-orders',
  '0 * * * *',
  $$select public.cleanup_stale_orders();$$
);