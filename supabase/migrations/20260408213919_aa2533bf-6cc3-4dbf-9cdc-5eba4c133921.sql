-- Drop the dangerous self-delete policy
DROP POLICY IF EXISTS "Users can delete own roles" ON public.user_roles;

-- Add a restricted self-delete policy that only allows deleting non-admin roles
CREATE POLICY "Users can delete own non-admin roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND role <> 'admin'::app_role);