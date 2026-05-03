-- 1. Удалить дубль payout (оставить более ранний)
DELETE FROM public.payouts
WHERE id = '921cf256-050f-4f78-ae5f-1742db98e124';

-- 2. Уникальный индекс на escrow_id, чтобы дубли больше не появлялись
CREATE UNIQUE INDEX IF NOT EXISTS payouts_escrow_id_unique
  ON public.payouts(escrow_id);

-- 3. Backfill payouts для released-эскроу без выплат
INSERT INTO public.payouts
  (user_id, task_id, escrow_id, assignment_id, amount, net_amount, commission, currency, status)
SELECT
  e.tasker_id, e.task_id, e.id, e.assignment_id,
  e.amount, e.net_amount, COALESCE(e.commission_amount, 0), e.currency, 'pending'
FROM public.escrow_transactions e
LEFT JOIN public.payouts p ON p.escrow_id = e.id
WHERE e.status = 'released' AND p.id IS NULL;