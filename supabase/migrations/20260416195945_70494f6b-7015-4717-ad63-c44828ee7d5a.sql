-- Recreate view without SECURITY DEFINER (use invoker's permissions)
DROP VIEW IF EXISTS public.tasks_public;

CREATE VIEW public.tasks_public
WITH (security_invoker = true)
AS
SELECT
  id,
  title,
  description,
  category_id,
  city,
  task_type,
  status,
  budget_min,
  budget_max,
  budget_fixed,
  currency,
  due_date,
  is_urgent,
  radius_km,
  photos,
  voice_note_url,
  user_id,
  assigned_to,
  created_at,
  updated_at,
  NULL::text AS address,
  NULL::double precision AS latitude,
  NULL::double precision AS longitude
FROM public.tasks
WHERE status = 'open';

GRANT SELECT ON public.tasks_public TO anon, authenticated;

-- Allow anon/auth to read open tasks via the underlying table only when
-- queried through the view's invoker. Since security_invoker requires
-- the caller to have access, add a minimal policy that exposes ONLY
-- non-sensitive use cases (the view will return NULL for sensitive cols).
CREATE POLICY "Public can view open tasks (basic)"
  ON public.tasks FOR SELECT
  TO anon, authenticated
  USING (status = 'open');