-- Remove the broad public policy so address/coords are not exposed
DROP POLICY IF EXISTS "Public can view open tasks (basic)" ON public.tasks;

-- Recreate view as SECURITY DEFINER so anon can read open tasks
-- without direct access to the tasks table (sensitive cols are NULL'd).
DROP VIEW IF EXISTS public.tasks_public;

CREATE VIEW public.tasks_public
WITH (security_invoker = false)
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