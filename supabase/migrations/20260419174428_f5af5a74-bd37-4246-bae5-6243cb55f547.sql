-- ============================================================
-- CLEANUP: Remove duplicate and dangerous RLS policies
-- ============================================================

-- ── 1. ORDERS: drop 9 messy/duplicate/insecure policies ──
-- Some leak payment data (orders_public_open exposes any "open" payment).
-- Some are nonsensical (orders_secure_select compares auth.uid() = task_id).
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_read_open" ON public.orders;
DROP POLICY IF EXISTS "orders_public_open" ON public.orders;
DROP POLICY IF EXISTS "orders_secure_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
DROP POLICY IF EXISTS "orders_delete" ON public.orders;
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Service role can read orders" ON public.orders;
DROP POLICY IF EXISTS "Service role can update orders" ON public.orders;

-- Recreate a clean, minimal set:
-- Owner can see/create/delete their own payment orders.
-- Admins can view all. Service role (Allpay webhook) can read/update.
CREATE POLICY "orders_owner_select"
  ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "orders_owner_insert"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "orders_owner_delete"
  ON public.orders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "orders_admin_select"
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "orders_service_select"
  ON public.orders FOR SELECT TO public
  USING (auth.role() = 'service_role');

CREATE POLICY "orders_service_update"
  ON public.orders FOR UPDATE TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 2. PROFILES: drop duplicate admin policy ──
-- "Admins and superadmins have full access" (ALL) already covers SELECT.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- ── 3. BANNED_USERS: RLS enabled but ZERO policies = locked out completely ──
-- Add admin-only policies so the ban system can actually function.
CREATE POLICY "banned_users_admin_select"
  ON public.banned_users FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "banned_users_admin_insert"
  ON public.banned_users FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()) AND banned_by = auth.uid());

CREATE POLICY "banned_users_admin_delete"
  ON public.banned_users FOR DELETE TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

-- Allow users to know if they themselves are banned (used by useAuth.tsx)
CREATE POLICY "banned_users_self_select"
  ON public.banned_users FOR SELECT TO authenticated
  USING (auth.uid() = user_id);