## Goal

Complete Flow4You's financial flow: enforce a $50 USD-equivalent minimum task price everywhere, make admin task editing (with price audit) fully functional, and finish the payout pipeline so release-escrow uses the tasker's saved payout account — all without altering existing AllPay, escrow math, commission, or WhatsApp architecture.

---

## 1. Minimum task price = $50 USD equivalent

Single source of truth helper in `src/lib/pricing.ts`:

- `MIN_PRICE_USD = 50`
- `getMinPrice(currency, rates)` → USD: 50, ILS: `Math.ceil(50 * rates.ILS)`, generic for future currencies.
- `formatMinPriceMessage(currency, rates, t)` → localized string ("Minimum task price is ₪180 (equivalent of $50).").

Wire it in:

- **Frontend `CreateTask.tsx`**: replace any hard-coded minimum, use `useExchangeRates()` + `getMinPrice`. On currency switch, recompute and re-validate; if current price < new minimum, bump to minimum and toast.
- **`PriceEstimator.tsx` / AI suggested price**: clamp `recommended_price`, `min_price`, `max_price` to `>= getMinPrice(currency, rates)`.
- **Edge function `estimate-task-price`**: clamp output to ≥ 50 USD equivalent (server already knows ILS; reuse `exchange-rates`).
- **RPC / SQL**: add a `validate_task_price()` trigger on `public.tasks` (BEFORE INSERT/UPDATE of `price`/`currency`) that rejects values below 50 USD equivalent using a small `app_settings`-stored fallback rate (`usd_ils_rate`, default 3.7) — keeps SQL immutable-safe by reading a settings row, not calling `now()`-based logic.
- **`create-payment` edge function**: re-check minimum against the chosen amount (proposal price or task price) before creating AllPay session.

Errors surface as `Minimum task price is $50` / `Minimum task price is ₪XXX (equivalent of $50)`.

---

## 2. Single source of truth for amounts

Audit + document in code comments:

- If `task.assignment_id` exists → amount = `accepted_proposal.price` (already the case in `create-payment`; verify).
- Else → `task.price`.

Add a SQL helper `public.task_effective_price(task_id uuid)` returning `(amount numeric, currency text, source text)` so `create-payment`, `release-escrow`, admin tools, and reports all call the same function. No behavior change where it already matches; only consolidation.

---

## 3. Admin task editing + price audit

- **`src/pages/admin/AdminOrders.tsx`** (or the equivalent admin tasks view): add an "Edit task" dialog with fields title, description, category, address, city, scheduled date/time, status, currency, price, assigned tasker (if column exists), `admin_notes`.
- New column `tasks.admin_notes text` if missing.
- New table `public.task_price_audit` (task_id, admin_user_id, old_price, new_price, old_currency, new_currency, reason, created_at) with RLS: only admins read/insert.
- When admin saves a price change:
  - If `escrow_transactions` or `payments` exist for the task → show confirm dialog: *"This task already has payment records. Changing the price may require manual payment adjustment."* Require typed reason.
  - Insert audit row; do **not** mutate existing escrow/payment rows.

---

## 4. Payout account wiring in release-escrow

In `supabase/functions/release-escrow/index.ts`:

- Load tasker's active `payout_accounts` row (`status in ('active','verified')`).
- Compute payout amount strictly from escrow row (`net_amount`, `currency`) — no change to math.
- Insert `payouts` row with `payout_account_id` populated when present, else leave null and set `status = 'missing_payout_details'` (replace the current `pending` in that branch).
- Notifications: keep existing in-app + `enqueue_whatsapp` calls. Add `payout_account_id` to event metadata.
- Add column `payouts.payout_account_id uuid references payout_accounts(id)` if missing.

---

## 5. Tasker Payout Setup block (Profile)

`TaskerPayoutSetup.tsx` already exists; extend it:

- 4 steps: Contractor Agreement → Payment Details → Tax/Esek Patur → Ready.
- CTA per step (Sign agreement / Add payment details / Add tax info).
- Pull state from `contractor_agreements`, `payout_accounts`, `esek_patur_applications`.

`ContractorPayments.tsx` already supports IL/CY split. Add `tax_number` field (Israel: Esek Patur or Tax ID; Cyprus: VAT/Tax ID). Persist into `payout_accounts.tax_id` (add column if missing).

---

## 6. Notifications

Reuse `notifications` + `enqueue_whatsapp` for:

- `payout_details_saved` — after `payout_accounts` insert/update.
- `payout_details_verified` — when admin flips status to verified.
- `task_completed` / `payout_released` — already wired in release-escrow.
- `payout_details_missing` — already wired.

No new notification system.

---

## Technical details

**Migrations (single migration):**

```sql
-- 1. price audit
create table public.task_price_audit (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  admin_user_id uuid not null,
  old_price numeric, new_price numeric,
  old_currency text, new_currency text,
  reason text,
  created_at timestamptz not null default now()
);
grant select, insert on public.task_price_audit to authenticated;
grant all on public.task_price_audit to service_role;
alter table public.task_price_audit enable row level security;
create policy "admins read price audit" on public.task_price_audit
  for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));
create policy "admins insert price audit" on public.task_price_audit
  for insert to authenticated
  with check (admin_user_id = auth.uid()
    and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin')));

-- 2. admin notes + tax id + payout link
alter table public.tasks add column if not exists admin_notes text;
alter table public.payout_accounts add column if not exists tax_id text;
alter table public.payouts add column if not exists payout_account_id uuid references public.payout_accounts(id);

-- 3. settings-driven min price
insert into public.app_settings(key, value)
  values ('min_task_price_usd','50'), ('usd_ils_rate','3.7')
  on conflict (key) do nothing;

-- 4. validation trigger
create or replace function public.validate_task_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  min_usd numeric := coalesce((select value::numeric from public.app_settings where key='min_task_price_usd'),50);
  rate    numeric := coalesce((select value::numeric from public.app_settings where key='usd_ils_rate'),3.7);
  min_in_currency numeric;
begin
  if new.price is null then return new; end if;
  min_in_currency := case upper(coalesce(new.currency,'USD'))
    when 'USD' then min_usd
    when 'ILS' then ceil(min_usd * rate)
    else min_usd
  end;
  if new.price < min_in_currency then
    raise exception 'Task price below minimum (% %).', min_in_currency, coalesce(new.currency,'USD');
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_task_price on public.tasks;
create trigger trg_validate_task_price
  before insert or update of price, currency on public.tasks
  for each row execute function public.validate_task_price();

-- 5. effective price helper
create or replace function public.task_effective_price(p_task_id uuid)
returns table(amount numeric, currency text, source text)
language sql stable security definer set search_path = public as $$
  select coalesce(p.price, t.price) as amount,
         coalesce(t.currency,'USD') as currency,
         case when p.id is not null then 'accepted_proposal' else 'task' end as source
  from public.tasks t
  left join public.proposals p on p.task_id = t.id and p.status = 'accepted'
  where t.id = p_task_id
  limit 1;
$$;
grant execute on function public.task_effective_price(uuid) to authenticated, service_role;
```

**Code:**
- New `src/lib/pricing.ts` (constants + helpers).
- `CreateTask.tsx`, `PriceEstimator.tsx` → use helpers, recompute on currency change, clamp AI suggestions.
- `estimate-task-price/index.ts` → clamp output ≥ min USD/ILS.
- `create-payment/index.ts` → re-validate amount against minimum and reuse `task_effective_price` (or keep current proposal-aware lookup, just add min check).
- `AdminOrders.tsx` → edit dialog + price-change confirm + audit insert + warning when escrow/payment exists.
- `release-escrow/index.ts` → look up `payout_accounts`, attach `payout_account_id`, set `missing_payout_details` status when absent.
- `TaskerPayoutSetup.tsx` → 4-step checklist with CTAs.
- `ContractorPayments.tsx` → add tax_id field; emit `payout_details_saved` notification + WhatsApp enqueue.

**Verification queries** (read-only, after migration):
1. `\d+ public.tasks` → trigger present.
2. `select * from public.app_settings where key in ('min_task_price_usd','usd_ils_rate');`
3. `select * from public.task_effective_price('<task_id>');`
4. `select id, amount, net_amount, payout_account_id, status from public.payouts order by created_at desc limit 5;`
5. `select * from public.task_price_audit order by created_at desc limit 5;`

**Untouched:** AllPay API, escrow math, commission formula, existing payment/escrow rows, WhatsApp queue/ChatbotIsrael, `enqueue_whatsapp` signature, proposal selection logic (only adds min-price check), release-escrow business logic (only adds payout-account lookup).
