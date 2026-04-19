
-- Fix RLS on profiles: should match by user_id, not id
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow public read of basic profile fields for display (display_name only) is already covered by profiles_public view.
-- Ensure user_roles SELECT works for own roles (it does: auth.uid() = user_id)
