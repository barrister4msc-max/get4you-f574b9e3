-- 1. Helper: is the currently authenticated user banned?
-- banned_users has no is_active column — presence of a row means banned.
create or replace function public.is_current_user_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.banned_users b
    where b.user_id = auth.uid()
  );
$$;

revoke all on function public.is_current_user_banned() from public;
grant execute on function public.is_current_user_banned() to authenticated, anon;

-- 2. RESTRICTIVE deny-policies on critical tables.
-- RESTRICTIVE policies are AND-combined with existing PERMISSIVE policies,
-- so this only ADDS a guard; no existing rule is removed or weakened.
-- service_role bypasses RLS and is unaffected.
-- Banned user check applies to TO authenticated only.

do $$
declare
  tbl text;
  tables text[] := array[
    'tasks',
    'proposals',
    'orders',
    'chat_messages',
    'order_messages',
    'escrow_transactions',
    'payouts',
    'reviews',
    'complaints',
    'profiles'
  ];
begin
  foreach tbl in array tables loop
    execute format(
      'drop policy if exists "deny_banned_users" on public.%I;',
      tbl
    );
    execute format(
      'create policy "deny_banned_users" on public.%I '
      'as restrictive '
      'for all '
      'to authenticated '
      'using (not public.is_current_user_banned()) '
      'with check (not public.is_current_user_banned());',
      tbl
    );
  end loop;
end $$;