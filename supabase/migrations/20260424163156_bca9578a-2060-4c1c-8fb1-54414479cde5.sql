DROP TRIGGER IF EXISTS rate_limit_orders ON public.orders;

CREATE OR REPLACE FUNCTION public.track_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(NEW, OLD);
END;
$$;