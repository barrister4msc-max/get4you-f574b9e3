CREATE POLICY "Task owner can update proposals" ON public.proposals
FOR UPDATE TO authenticated
USING (
  auth.uid() IN (
    SELECT t.user_id FROM tasks t WHERE t.id = proposals.task_id
  )
);