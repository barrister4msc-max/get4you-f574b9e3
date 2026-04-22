
-- 1. Уникальный частичный индекс: один активный отклик от пользователя на задачу
-- Сначала "схлопнем" возможные существующие дубликаты в активных статусах,
-- оставив самый свежий.
WITH ranked AS (
  SELECT id, task_id, user_id, status, created_at,
    ROW_NUMBER() OVER (PARTITION BY task_id, user_id 
                       ORDER BY created_at DESC) AS rn
  FROM public.proposals
  WHERE status IN ('pending', 'accepted')
)
UPDATE public.proposals p
SET status = 'rejected', updated_at = now()
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS proposals_unique_active_per_user_task
ON public.proposals (task_id, user_id)
WHERE status IN ('pending', 'accepted');

-- 2. Идемпотентная RPC для отправки отклика.
-- Возвращает id существующего активного отклика, если он уже есть,
-- иначе создаёт новый. Безопасна к гонкам благодаря advisory lock + unique index.
CREATE OR REPLACE FUNCTION public.submit_proposal(
  p_task_id uuid,
  p_price numeric,
  p_currency text DEFAULT 'USD',
  p_comment text DEFAULT NULL,
  p_portfolio_urls text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_task_owner uuid;
  v_task_status task_status;
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'Price must be positive' USING ERRCODE = '22023';
  END IF;

  -- Проверяем задачу
  SELECT user_id, status INTO v_task_owner, v_task_status
  FROM public.tasks WHERE id = p_task_id;

  IF v_task_owner IS NULL THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_task_owner = v_user_id THEN
    RAISE EXCEPTION 'Cannot submit a proposal on your own task' USING ERRCODE = '42501';
  END IF;

  IF v_task_status NOT IN ('open') THEN
    RAISE EXCEPTION 'Task is not open for proposals' USING ERRCODE = '22023';
  END IF;

  -- Защита от гонки: блокируем по комбинации (task, user)
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_task_id::text || ':' || v_user_id::text, 0)
  );

  -- Идемпотентность: если есть активный отклик — возвращаем его id
  SELECT id INTO v_existing_id
  FROM public.proposals
  WHERE task_id = p_task_id
    AND user_id = v_user_id
    AND status IN ('pending', 'accepted')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Создаём отклик. Unique index страхует от вставленного параллельно дубликата.
  BEGIN
    INSERT INTO public.proposals (task_id, user_id, price, currency, comment, portfolio_urls, status)
    VALUES (p_task_id, v_user_id, p_price, COALESCE(p_currency, 'USD'), p_comment, p_portfolio_urls, 'pending')
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_new_id
    FROM public.proposals
    WHERE task_id = p_task_id
      AND user_id = v_user_id
      AND status IN ('pending', 'accepted')
    LIMIT 1;
  END;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_proposal(uuid, numeric, text, text, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_proposal(uuid, numeric, text, text, text[]) TO authenticated;
