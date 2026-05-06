ALTER VIEW public.tasks_public SET (security_invoker = false);
GRANT SELECT ON public.tasks_public TO anon, authenticated;