
-- 1. Drop the old permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON public.reviews;

-- 2. Add participation-verified INSERT policy
CREATE POLICY "Verified participants can review"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = reviews.task_id
        AND t.status = 'completed'
        AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())
    )
    AND reviewer_id != reviewee_id
  );

-- 3. Add unique constraint to prevent duplicate reviews
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_reviewer_task_unique UNIQUE (reviewer_id, task_id);

-- 4. Add rating validation trigger
CREATE OR REPLACE FUNCTION public.validate_review_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_review_rating_trigger
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_rating();
