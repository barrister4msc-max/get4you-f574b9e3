-- Re-enqueue welcome WhatsApp messages using the approved English `account_created` template.
-- We do NOT touch the original sent rows (kept as history). We insert new `pending` rows
-- for prior welcome messages routed through chatbotisrael, guarded by an idempotency
-- check on metadata.source so this is safe to run more than once.

WITH approved AS (
  SELECT
    'Your 4You.AI account registration was completed successfully. '
    || 'This message confirms that your account has been created. '
    || 'You can now log in using the email address used during registration.' AS msg
),
src AS (
  SELECT wl.*
  FROM public.whatsapp_logs wl
  WHERE wl.event_type = 'welcome'
    AND wl.provider = 'chatbotisrael'
    AND wl.status = 'sent'
    AND wl.target_user_id IS NOT NULL
    AND (
      COALESCE(wl.metadata->>'template', '') <> 'account_created'
      OR COALESCE(wl.metadata->>'message', '') ILIKE '%Добро пожаловать%'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.whatsapp_logs x
      WHERE x.event_type = 'welcome'
        AND x.target_user_id = wl.target_user_id
        AND x.metadata->>'source' = 'resend_account_created_template_fix'
    )
)
INSERT INTO public.whatsapp_logs (
  actor_id, target_user_id, phone, event_type, task_id, status, provider, metadata
)
SELECT
  src.actor_id,
  src.target_user_id,
  src.phone,
  'welcome',
  src.task_id,
  'pending',
  'twilio', -- default; process-whatsapp-queue will set provider='chatbotisrael' on send
  COALESCE(src.metadata, '{}'::jsonb) || jsonb_build_object(
    'source', 'resend_account_created_template_fix',
    'template', 'account_created',
    'template_language', 'en',
    'original_language', COALESCE(src.metadata->>'language', 'ru'),
    'final_message', (SELECT msg FROM approved)
  )
FROM src;
