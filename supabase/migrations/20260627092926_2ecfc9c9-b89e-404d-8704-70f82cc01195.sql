DROP TRIGGER IF EXISTS trg_dispatch_proposal_created_webhook ON public.proposals;
DROP FUNCTION IF EXISTS public.dispatch_proposal_created_webhook();