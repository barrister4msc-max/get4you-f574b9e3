
-- 1. Fix profiles SELECT: restrict to owner + admin only
DROP POLICY IF EXISTS "Users can view basic profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Create bulk public profile function
CREATE OR REPLACE FUNCTION public.get_public_profiles(target_user_ids uuid[])
RETURNS TABLE(
  id uuid, user_id uuid, display_name text, avatar_url text,
  bio text, city text, preferred_language text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.display_name, p.avatar_url, p.bio, p.city,
         p.preferred_language, p.created_at
  FROM public.profiles p WHERE p.user_id = ANY(target_user_ids);
$$;

-- 3. Add storage DELETE policies for all buckets
CREATE POLICY "Users can delete own avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own task photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'task-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own portfolios"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'portfolios' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own voice notes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own esek patur docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'esek-patur-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own esek patur docs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'esek-patur-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own employment docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'employment-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own employment docs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'employment-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
