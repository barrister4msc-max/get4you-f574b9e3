
-- 1. Админы видят все задачи (для AdminOrders)
CREATE POLICY "Admins can view all tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update all tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can delete all tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- 2. Админы видят все профили (нужно для AdminUsers/Orders join по именам)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- 3. INSERT политика на chat_messages: участники задачи + админы могут писать
CREATE POLICY "Participants and admins can send chat messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND (
    public.is_task_participant(auth.uid(), task_id)
    OR public.is_admin_or_superadmin(auth.uid())
  )
);

-- 4. Админы видят все сообщения чатов
CREATE POLICY "Admins can view all chat messages"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- 5. Админы видят все отклики
CREATE POLICY "Admins can view all proposals"
ON public.proposals
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- 6. Админы видят все заявки/заказы
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- 7. Админы могут писать direct_messages любому пользователю
DROP POLICY IF EXISTS "Insert messages with role restrictions" ON public.direct_messages;

CREATE POLICY "Insert messages with role restrictions"
ON public.direct_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND (
    -- Админ может писать кому угодно
    public.is_admin_or_superadmin(auth.uid())
    -- Любой пользователь может писать админу
    OR public.is_admin_or_superadmin(recipient_id)
  )
);

-- 8. Админы видят все эскроу/выплаты/жалобы (для админ-панели)
CREATE POLICY "Admins can view all escrow"
ON public.escrow_transactions
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can view all payouts"
ON public.payouts
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can view all complaints"
ON public.complaints
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update complaints"
ON public.complaints
FOR UPDATE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- 9. Админы видят весь аудит-лог
CREATE POLICY "Admins can view audit log"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));

-- 10. Админы видят отзывы (для модерации) и могут удалять
CREATE POLICY "Admins can delete reviews"
ON public.reviews
FOR DELETE
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()));
