
-- 1. Запрет self-proposals (нельзя откликаться на свою задачу)
CREATE OR REPLACE FUNCTION public.prevent_self_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task_owner uuid;
BEGIN
  SELECT user_id INTO _task_owner FROM public.tasks WHERE id = NEW.task_id;
  IF _task_owner = NEW.user_id THEN
    -- Логируем попытку
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (NEW.user_id, 'blocked_self_proposal', 'task', NEW.task_id::text,
      jsonb_build_object('reason', 'User tried to bid on own task'));
    RAISE EXCEPTION 'You cannot create a proposal for your own task';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_proposal_trigger ON public.proposals;
CREATE TRIGGER prevent_self_proposal_trigger
  BEFORE INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_proposal();

-- 2. Запрет self-assignment в tasks
CREATE OR REPLACE FUNCTION public.prevent_self_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to = NEW.user_id THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (COALESCE(auth.uid(), NEW.user_id), 'blocked_self_assignment', 'task', NEW.id::text,
      jsonb_build_object('reason', 'Owner cannot be assignee'));
    RAISE EXCEPTION 'Task owner cannot be assigned as the executor';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_assignment_trigger ON public.tasks;
CREATE TRIGGER prevent_self_assignment_trigger
  BEFORE INSERT OR UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_assignment();

-- 3. Запрет создания заказа самому себе (client != tasker)
CREATE OR REPLACE FUNCTION public.prevent_self_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _proposer uuid;
BEGIN
  IF NEW.proposal_id IS NOT NULL THEN
    SELECT user_id INTO _proposer FROM public.proposals WHERE id = NEW.proposal_id;
    IF _proposer = NEW.user_id THEN
      INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
      VALUES (NEW.user_id, 'blocked_self_order', 'order', NEW.id::text,
        jsonb_build_object('reason', 'Client cannot pay own proposal'));
      RAISE EXCEPTION 'You cannot create an order for your own proposal';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_order_trigger ON public.orders;
CREATE TRIGGER prevent_self_order_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_order();

-- 4. Запрет escrow самому себе
CREATE OR REPLACE FUNCTION public.prevent_self_escrow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id = NEW.tasker_id THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (COALESCE(auth.uid(), NEW.client_id), 'blocked_self_escrow', 'escrow', NEW.id::text,
      jsonb_build_object('reason', 'Client and tasker are the same'));
    RAISE EXCEPTION 'Client and tasker cannot be the same user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_escrow_trigger ON public.escrow_transactions;
CREATE TRIGGER prevent_self_escrow_trigger
  BEFORE INSERT ON public.escrow_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_escrow();

-- 5. Логирование admin-действий над tasks
CREATE OR REPLACE FUNCTION public.log_admin_task_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _is_admin boolean;
BEGIN
  IF _actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  _is_admin := has_role(_actor, 'admin'::app_role) OR has_role(_actor, 'super_admin'::app_role);

  -- Логируем только если admin модифицирует чужую задачу
  IF _is_admin AND COALESCE(NEW.user_id, OLD.user_id) <> _actor THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      _actor,
      'admin_task_' || lower(TG_OP),
      'task',
      COALESCE(NEW.id, OLD.id)::text,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'task_owner', COALESCE(NEW.user_id, OLD.user_id)
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS log_admin_task_action_trigger ON public.tasks;
CREATE TRIGGER log_admin_task_action_trigger
  AFTER UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_task_action();

-- 6. Логирование admin-действий над escrow и orders (super_admin only)
CREATE OR REPLACE FUNCTION public.log_admin_money_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _is_super boolean;
BEGIN
  IF _actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  _is_super := has_role(_actor, 'super_admin'::app_role);

  IF _is_super THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      _actor,
      'super_admin_' || TG_TABLE_NAME || '_' || lower(TG_OP),
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id)::text,
      jsonb_build_object(
        'old_status', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
        'new_status', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END,
        'amount', COALESCE(NEW.amount, OLD.amount)
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS log_admin_escrow_trigger ON public.escrow_transactions;
CREATE TRIGGER log_admin_escrow_trigger
  AFTER UPDATE OR DELETE ON public.escrow_transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_money_action();

DROP TRIGGER IF EXISTS log_admin_payouts_trigger ON public.payouts;
CREATE TRIGGER log_admin_payouts_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_money_action();

-- 7. Логирование удаления отзывов (admin only)
CREATE OR REPLACE FUNCTION public.log_review_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role) THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      auth.uid(),
      'admin_deleted_review',
      'review',
      OLD.id::text,
      jsonb_build_object(
        'task_id', OLD.task_id,
        'reviewer_id', OLD.reviewer_id,
        'reviewee_id', OLD.reviewee_id,
        'rating', OLD.rating,
        'comment', OLD.comment
      )
    );
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS log_review_deletion_trigger ON public.reviews;
CREATE TRIGGER log_review_deletion_trigger
  BEFORE DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.log_review_deletion();

-- 8. Усилить отзывы: только участник завершённой задачи (уже есть, но добавим явный self-review block)
-- Проверка reviewer_id <> reviewee_id уже в RLS, всё ок.
