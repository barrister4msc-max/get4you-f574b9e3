
-- 1. price audit table
create table if not exists public.task_price_audit (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  admin_user_id uuid not null,
  old_price numeric,
  new_price numeric,
  old_currency text,
  new_currency text,
  reason text,
  created_at timestamptz not null default now()
);
grant select, insert on public.task_price_audit to authenticated;
grant all on public.task_price_audit to service_role;
alter table public.task_price_audit enable row level security;

drop policy if exists "admins read price audit" on public.task_price_audit;
create policy "admins read price audit" on public.task_price_audit
  for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

drop policy if exists "admins insert price audit" on public.task_price_audit;
create policy "admins insert price audit" on public.task_price_audit
  for insert to authenticated
  with check (
    admin_user_id = auth.uid()
    and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'))
  );

-- 2. supporting columns
alter table public.tasks add column if not exists admin_notes text;
alter table public.payout_accounts add column if not exists tax_id text;
alter table public.payouts add column if not exists payout_account_id uuid references public.payout_accounts(id);

-- 3. settings-driven min price
insert into public.app_settings(key, value)
  values ('min_task_price_usd','50'), ('usd_ils_rate','3.7')
  on conflict (key) do nothing;

-- 4. validation trigger for task price
create or replace function public.validate_task_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  min_usd numeric := coalesce((select value::numeric from public.app_settings where key='min_task_price_usd'), 50);
  rate    numeric := coalesce((select value::numeric from public.app_settings where key='usd_ils_rate'), 3.7);
  cur     text    := upper(coalesce(new.currency, 'USD'));
  min_in_currency numeric;
begin
  -- Determine which price column is being set on this row.
  -- Use COALESCE so either budget_fixed or budget_min triggers validation.
  if new.budget_fixed is null and new.budget_min is null then
    return new;
  end if;

  min_in_currency := case cur
    when 'USD' then min_usd
    when 'ILS' then ceil(min_usd * rate)
    else min_usd
  end;

  if coalesce(new.budget_fixed, new.budget_min, 0) > 0
     and coalesce(new.budget_fixed, new.budget_min) < min_in_currency then
    raise exception 'Task price below minimum (% %).', min_in_currency, cur
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_task_price on public.tasks;
create trigger trg_validate_task_price
  before insert or update of budget_fixed, budget_min, currency on public.tasks
  for each row execute function public.validate_task_price();

-- 5. effective price helper (single source of truth for amount)
create or replace function public.task_effective_price(p_task_id uuid)
returns table(amount numeric, currency text, source text)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(p.price, t.budget_fixed, t.budget_min)::numeric as amount,
    coalesce(p.currency, t.currency, 'USD') as currency,
    case when p.id is not null then 'accepted_proposal' else 'task' end as source
  from public.tasks t
  left join public.proposals p on p.task_id = t.id and p.status = 'accepted'
  where t.id = p_task_id
  order by p.created_at desc nulls last
  limit 1;
$$;

grant execute on function public.task_effective_price(uuid) to authenticated, service_role;
