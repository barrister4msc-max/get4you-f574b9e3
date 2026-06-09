
-- Helper to flip a CASCADE FK -> SET NULL and make the column nullable
DO $$
DECLARE
  r RECORD;
  fk_cols TEXT;
BEGIN
  -- tasks.user_id
  ALTER TABLE public.tasks ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_user_id_fkey;
  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

  -- proposals.user_id
  ALTER TABLE public.proposals ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_user_id_fkey;
  ALTER TABLE public.proposals
    ADD CONSTRAINT proposals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

  -- reviews.reviewer_id / reviewee_id
  ALTER TABLE public.reviews ALTER COLUMN reviewer_id DROP NOT NULL;
  ALTER TABLE public.reviews ALTER COLUMN reviewee_id DROP NOT NULL;
  ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_reviewer_id_fkey;
  ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_reviewee_id_fkey;
  ALTER TABLE public.reviews
    ADD CONSTRAINT reviews_reviewer_id_fkey
    FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.reviews
    ADD CONSTRAINT reviews_reviewee_id_fkey
    FOREIGN KEY (reviewee_id) REFERENCES auth.users(id) ON DELETE SET NULL;

  -- direct_messages.sender_id / recipient_id
  ALTER TABLE public.direct_messages ALTER COLUMN sender_id DROP NOT NULL;
  ALTER TABLE public.direct_messages ALTER COLUMN recipient_id DROP NOT NULL;
  ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_sender_id_fkey;
  ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_recipient_id_fkey;
  ALTER TABLE public.direct_messages
    ADD CONSTRAINT direct_messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.direct_messages
    ADD CONSTRAINT direct_messages_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE SET NULL;

  -- payout_accounts.user_id
  ALTER TABLE public.payout_accounts ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE public.payout_accounts DROP CONSTRAINT IF EXISTS payout_accounts_user_id_fkey;
  ALTER TABLE public.payout_accounts
    ADD CONSTRAINT payout_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

  -- withdrawal_requests.user_id
  ALTER TABLE public.withdrawal_requests ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE public.withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_user_id_fkey;
  ALTER TABLE public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
END$$;

-- Super-admin-only fallback for forcing deletion when admin API fails.
CREATE OR REPLACE FUNCTION public.admin_force_delete_auth_user(_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;
  IF _target = auth.uid() THEN
    RAISE EXCEPTION 'cannot delete your own account';
  END IF;
  UPDATE public.tasks SET assigned_to = NULL WHERE assigned_to = _target;
  DELETE FROM public.user_roles WHERE user_id = _target;
  DELETE FROM public.profiles   WHERE user_id = _target;
  DELETE FROM auth.users        WHERE id      = _target;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_delete_auth_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_auth_user(uuid) TO authenticated, service_role;

-- One-shot cleanup of the orphaned account.
DO $$
DECLARE
  v_id uuid := '41cb7a67-d76a-4ad2-848e-fc7ae2ccf654';
BEGIN
  UPDATE public.tasks SET assigned_to = NULL WHERE assigned_to = v_id;
  DELETE FROM public.user_roles WHERE user_id = v_id;
  DELETE FROM public.profiles   WHERE user_id = v_id;
  DELETE FROM auth.users        WHERE id      = v_id;
END$$;
