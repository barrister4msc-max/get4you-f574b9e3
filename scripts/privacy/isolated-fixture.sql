-- Isolated fixture only: simplified auth/admin helpers, no production data.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
CREATE TYPE public.task_type AS ENUM ('onsite','remote');
CREATE TYPE public.task_status AS ENUM ('draft','open','in_progress','completed','cancelled','dispute','awaiting_payment','completion_requested');
CREATE TABLE public.tasks(id uuid PRIMARY KEY,user_id uuid,assigned_to uuid,category_id uuid,title text,description text,city text,task_type task_type,status task_status,budget_min numeric,budget_max numeric,budget_fixed numeric,currency text,due_date date,is_urgent boolean,radius_km integer,photos text[],voice_note_url text,created_at timestamptz,updated_at timestamptz,address text,latitude double precision,longitude double precision,service_details jsonb,schedule_mode text,time_mode text,due_time time,due_time_end time,schedule_timezone text,country_code text,city_id text,neighborhood_id text,geo_source text);
CREATE TABLE public.escrow_transactions(id uuid,task_id uuid,tasker_id uuid,client_id uuid,amount numeric,net_amount numeric,commission_amount numeric,commission_rate numeric,currency text,status text,held_at timestamptz,released_at timestamptz,refunded_at timestamptz,created_at timestamptz);
CREATE TABLE public.task_translations(task_id uuid,title text,description text);
CREATE FUNCTION public.is_current_user_banned() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_admin_or_superadmin(user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT user_id='00000000-0000-0000-0000-000000000004'::uuid $$;
GRANT ALL ON public.tasks,public.task_translations TO anon,authenticated,service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY participant ON public.tasks FOR SELECT TO authenticated USING(auth.uid()=user_id OR auth.uid()=assigned_to OR is_admin_or_superadmin(auth.uid()));
CREATE POLICY deny_banned_users ON public.tasks FOR ALL TO authenticated USING(NOT is_current_user_banned());
ALTER TABLE public.task_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read task translations" ON public.task_translations FOR SELECT USING(true);
