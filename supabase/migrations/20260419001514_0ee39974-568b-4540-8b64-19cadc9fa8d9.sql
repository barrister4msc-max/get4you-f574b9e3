-- Create SECURITY DEFINER function to check roles without RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'superadmin'::app_role)
  )
$$;

-- Fix user_roles recursion
DROP POLICY IF EXISTS "Admins and superadmins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
USING (public.is_admin_or_superadmin(auth.uid()));

-- Fix profiles policy that also references user_roles
DROP POLICY IF EXISTS "Admins and superadmins have full access" ON public.profiles;

CREATE POLICY "Admins and superadmins have full access"
ON public.profiles
FOR ALL
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

-- Fix direct_messages policies that reference user_roles
DROP POLICY IF EXISTS "Admins can delete messages" ON public.direct_messages;
DROP POLICY IF EXISTS "Insert messages with role restrictions" ON public.direct_messages;

CREATE POLICY "Admins can delete messages"
ON public.direct_messages
FOR DELETE
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Insert messages with role restrictions"
ON public.direct_messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND (
    public.is_admin_or_superadmin(auth.uid())
    OR public.is_admin_or_superadmin(recipient_id)
  )
);