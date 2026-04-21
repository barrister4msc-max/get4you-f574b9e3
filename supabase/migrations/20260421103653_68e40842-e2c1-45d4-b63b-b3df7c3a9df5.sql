-- Удаляем сломанный триггер rate-limit на tasks: функция вставляет в rate_limit(user_id, action),
-- но колонки `action` не существует, а `user_id` имеет тип integer (не uuid). Это ломает INSERT задач.
DROP TRIGGER IF EXISTS rate_limit_tasks ON public.tasks;