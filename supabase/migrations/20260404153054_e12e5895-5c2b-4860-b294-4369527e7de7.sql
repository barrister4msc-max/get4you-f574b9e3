-- Fix: Scope proposals INSERT policy to 'authenticated' role instead of 'public'
DROP POLICY IF EXISTS "Taskers can create proposals" ON public.proposals;

CREATE POLICY "Taskers can create proposals"
  ON public.proposals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);