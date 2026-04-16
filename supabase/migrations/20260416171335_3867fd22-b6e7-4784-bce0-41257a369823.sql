
-- 1. Create admin audit log table
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all audit logs"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert audit logs"
  ON public.admin_audit_log FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_admin_audit_log_actor ON public.admin_audit_log(actor_id);
CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);

-- 2. Escrow: admin read-only, super_admin full
DROP POLICY IF EXISTS "Admins can manage escrow" ON public.escrow_transactions;

CREATE POLICY "Super admins can manage escrow"
  ON public.escrow_transactions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can view escrow"
  ON public.escrow_transactions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Payouts: admin read-only, super_admin full
DROP POLICY IF EXISTS "Admins can manage payouts" ON public.payouts;

CREATE POLICY "Super admins can manage payouts"
  ON public.payouts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can view payouts"
  ON public.payouts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Orders: admin read-only, super_admin full
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;

CREATE POLICY "Super admins can manage all orders"
  ON public.orders FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can view all orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. User roles: only super_admin can assign/remove
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Super admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Update admin view policy to include super_admin
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins and super admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 6. Assign super_admin to Get4you@gmail.com
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'super_admin'::app_role
FROM public.profiles p
WHERE LOWER(p.email) = 'get4you@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
