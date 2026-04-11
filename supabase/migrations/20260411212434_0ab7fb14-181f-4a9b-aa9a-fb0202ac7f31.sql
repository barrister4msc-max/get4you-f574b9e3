CREATE POLICY "Task owner can delete rejected proposals"
ON public.proposals
FOR DELETE
TO authenticated
USING (
  status = 'rejected'::proposal_status
  AND auth.uid() IN (
    SELECT t.user_id FROM tasks t WHERE t.id = proposals.task_id
  )
);