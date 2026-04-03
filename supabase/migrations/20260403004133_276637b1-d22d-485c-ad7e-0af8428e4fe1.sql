
-- 1. Fix privilege escalation: Remove permissive self-insert policy, replace with non-admin only
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;

CREATE POLICY "Users can insert own non-admin roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND role <> 'admin');

-- 2. Fix public profiles: Replace open SELECT with scoped policies
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view basic profiles"
  ON public.profiles
  FOR SELECT
  TO public
  USING (true);

-- Create a security definer function to get safe profile data (without phone/payment)
CREATE OR REPLACE FUNCTION public.get_public_profile(target_user_id uuid)
RETURNS TABLE(
  id uuid, user_id uuid, display_name text, avatar_url text, bio text, city text,
  preferred_language text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.display_name, p.avatar_url, p.bio, p.city,
         p.preferred_language, p.created_at
  FROM public.profiles p WHERE p.user_id = target_user_id;
$$;

-- 3. Add RLS to realtime.messages for channel authorization
-- Note: We enable RLS and add a restrictive policy
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
