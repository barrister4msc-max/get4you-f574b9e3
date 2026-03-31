
CREATE TABLE public.escrow_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  tasker_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  commission_rate NUMERIC NOT NULL DEFAULT 0.15,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'held',
  held_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  released_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;

-- Clients can view their escrow transactions
CREATE POLICY "Clients can view own escrow" ON public.escrow_transactions
  FOR SELECT TO authenticated USING (auth.uid() = client_id);

-- Taskers can view their escrow transactions
CREATE POLICY "Taskers can view own escrow" ON public.escrow_transactions
  FOR SELECT TO authenticated USING (auth.uid() = tasker_id);

-- Only allow inserts from authenticated users for their own tasks
CREATE POLICY "Clients can create escrow" ON public.escrow_transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);

-- Clients can update their own escrow (for release/complete)
CREATE POLICY "Clients can update own escrow" ON public.escrow_transactions
  FOR UPDATE TO authenticated USING (auth.uid() = client_id);

-- Admins can manage all escrow
CREATE POLICY "Admins can manage escrow" ON public.escrow_transactions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_escrow_updated_at
  BEFORE UPDATE ON public.escrow_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
