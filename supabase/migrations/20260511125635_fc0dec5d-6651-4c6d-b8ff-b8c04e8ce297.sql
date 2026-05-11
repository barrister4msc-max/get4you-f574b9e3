-- Restrict admin management policy on seo_pages to authenticated users only,
-- so anon SELECTs don't trigger is_admin_or_superadmin() and fail with 42501.
DROP POLICY IF EXISTS "Admins can manage seo pages" ON public.seo_pages;

CREATE POLICY "Admins can manage seo pages"
ON public.seo_pages
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])
  )
);

-- Also ensure anon/authenticated can execute the helper, in case any other
-- policy references it.
GRANT EXECUTE ON FUNCTION public.is_admin_or_superadmin(uuid) TO anon, authenticated;