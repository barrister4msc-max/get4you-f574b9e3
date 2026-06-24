
-- Add manual payout workflow columns and Stripe-readiness fields
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid,
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS payout_provider text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS payout_method text NOT NULL DEFAULT 'manual_bank_transfer',
  ADD COLUMN IF NOT EXISTS provider_payout_id text,
  ADD COLUMN IF NOT EXISTS provider_account_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_response jsonb;

-- Allow admins to update payouts (mark as paid / reject / hold)
DROP POLICY IF EXISTS "Admins can update payouts" ON public.payouts;
CREATE POLICY "Admins can update payouts"
ON public.payouts
FOR UPDATE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

-- Backfill payout_account_id on existing pending payouts whose tasker now has
-- a verified payout account (so the historical withdrawal requests show up).
UPDATE public.payouts p
SET payout_account_id = pa.id
FROM public.payout_accounts pa
WHERE p.payout_account_id IS NULL
  AND p.user_id = pa.user_id
  AND pa.status = 'verified'
  AND p.status IN ('pending', 'missing_payout_details');

-- Any payout that now has an account attached should be 'pending'
UPDATE public.payouts
SET status = 'pending'
WHERE status = 'missing_payout_details'
  AND payout_account_id IS NOT NULL;
