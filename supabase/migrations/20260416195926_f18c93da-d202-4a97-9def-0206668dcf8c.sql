-- =========================================================
-- 1. SECURE order-chat-files BUCKET
-- =========================================================
-- Make bucket private (was public)
UPDATE storage.buckets SET public = false WHERE id = 'order-chat-files';

-- Drop any existing policies on order-chat-files
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (policyname ILIKE '%order-chat%' OR policyname ILIKE '%order_chat%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Path format expected: {order_id}/{filename}
CREATE POLICY "Order participants can read order-chat-files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'order-chat-files'
    AND public.is_order_participant(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "Order participants can upload order-chat-files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-chat-files'
    AND public.is_order_participant(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "Order participants can delete own order-chat-files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'order-chat-files'
    AND owner = auth.uid()
    AND public.is_order_participant(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "Admins can read all order-chat-files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'order-chat-files'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- =========================================================
-- 2. HIDE PRECISE LOCATION FROM PUBLIC TASKS
-- =========================================================
-- Restrict open task SELECT: only owner/assigned see precise data
-- We do this by replacing the public open-tasks policy and creating
-- a SECURITY DEFINER function for safe public listing.

DROP POLICY IF EXISTS "Open tasks are viewable by everyone" ON public.tasks;

-- Only owner & assignee see full task row directly
CREATE POLICY "Owners and assignees can view full task"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = assigned_to);

-- Public/anon access goes through the safe view below (no address/coords)
CREATE OR REPLACE VIEW public.tasks_public AS
SELECT
  id,
  title,
  description,
  category_id,
  city,
  task_type,
  status,
  budget_min,
  budget_max,
  budget_fixed,
  currency,
  due_date,
  is_urgent,
  radius_km,
  photos,
  voice_note_url,
  user_id,
  assigned_to,
  created_at,
  updated_at,
  -- DELIBERATELY OMITTED: address, latitude, longitude
  NULL::text AS address,
  NULL::double precision AS latitude,
  NULL::double precision AS longitude
FROM public.tasks
WHERE status = 'open';

GRANT SELECT ON public.tasks_public TO anon, authenticated;

-- =========================================================
-- 3. SECURE realtime.messages
-- =========================================================
-- Enable RLS on realtime.messages and restrict subscriptions
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can receive own task chats" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can receive own notifications" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can receive own order chats" ON realtime.messages;

-- Topic naming convention used in the app:
--   chat-{taskId}        -> task chat realtime
--   order-chat-{orderId} -> order chat realtime
--   notifications-{userId} or user notifications channels
CREATE POLICY "Realtime: task chat participants only"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    -- Allow notification channel for own user
    (realtime.topic() = 'notifications-' || auth.uid()::text)
    -- Task chat: chat-{taskId}
    OR (
      realtime.topic() LIKE 'chat-%'
      AND public.is_task_participant(
        auth.uid(),
        NULLIF(substring(realtime.topic() FROM 6), '')::uuid
      )
    )
    -- Order chat: order-chat-{orderId}
    OR (
      realtime.topic() LIKE 'order-chat-%'
      AND public.is_order_participant(
        auth.uid(),
        NULLIF(substring(realtime.topic() FROM 12), '')::uuid
      )
    )
    -- Admins can monitor all
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );