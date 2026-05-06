
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot ALTER spatial_ref_sys (owned by supabase_admin) — leaving as-is';
    RETURN;
  END;
  BEGIN
    EXECUTE 'CREATE POLICY "Anyone can read spatial_ref_sys" ON public.spatial_ref_sys FOR SELECT USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
