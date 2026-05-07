DROP VIEW IF EXISTS public.orders_safe;

CREATE VIEW public.orders_safe
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  task_id,
  proposal_id,
  assignment_id,
  amount,
  currency,
  price,
  status,
  provider,
  provider_status,
  provider_order_id,
  payment_url,
  title,
  description,
  lat,
  lng,
  created_at,
  updated_at
FROM public.orders;

GRANT SELECT ON public.orders_safe TO authenticated;