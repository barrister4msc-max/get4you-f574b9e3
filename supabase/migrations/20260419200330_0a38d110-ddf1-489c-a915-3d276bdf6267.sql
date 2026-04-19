-- Allow users to manage their own client/executor roles (not admin/superadmin)
CREATE POLICY "Users can insert own client/executor role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND role IN ('client'::app_role, 'executor'::app_role)
);

CREATE POLICY "Users can delete own client/executor role"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  AND role IN ('client'::app_role, 'executor'::app_role)
);