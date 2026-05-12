
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviews_count integer DEFAULT 0;

CREATE OR REPLACE FUNCTION public.refresh_profile_rating(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_avg numeric(3,2);
  v_count integer;
begin
  select
    coalesce(round(avg(rating)::numeric, 2), 0),
    count(*)
  into v_avg, v_count
  from public.reviews
  where reviewee_id = p_user_id;

  update public.profiles
  set
    average_rating = v_avg,
    reviews_count = v_count,
    rating = v_avg,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;
