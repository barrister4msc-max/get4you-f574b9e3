CREATE TABLE public.web_price_research_state (
 id text PRIMARY KEY,
 status integer NOT NULL DEFAULT 403,
 reason text NOT NULL,
 paused_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.web_price_research_state TO service_role;
ALTER TABLE public.web_price_research_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server manages price research pause" ON public.web_price_research_state FOR ALL TO service_role USING (true) WITH CHECK (true);