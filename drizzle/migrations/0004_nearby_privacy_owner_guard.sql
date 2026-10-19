DO $$
DECLARE body text;
BEGIN
 body := pg_get_functiondef('public.get_nearby_tasks(double precision,double precision,integer)'::regprocedure);
 body := replace(body, 'and t.status = ''open''', 'and t.status = ''open'' AND t.user_id IS NOT NULL');
 EXECUTE body;
END $$;