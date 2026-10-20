CREATE TABLE public.web_price_summaries (
 cache_key text PRIMARY KEY,
 service text NOT NULL,
 geography text NOT NULL,
 place text NOT NULL,
 applicability jsonb NOT NULL DEFAULT '{}'::jsonb,
 currency text NOT NULL DEFAULT 'ILS',
 offers jsonb NOT NULL DEFAULT '[]'::jsonb,
 checked_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL
);
GRANT ALL ON public.web_price_summaries TO service_role;
ALTER TABLE public.web_price_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server manages verified public price summaries" ON public.web_price_summaries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX web_price_summaries_expiry_idx ON public.web_price_summaries(expires_at);