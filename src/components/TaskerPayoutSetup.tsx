import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Wallet, FileSignature, ShieldCheck, Loader2 } from "lucide-react";

type Step = "not_started" | "pending" | "completed" | "verified";

const TaskerPayoutSetup = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasAgreement, setHasAgreement] = useState(false);
  const [accountStatus, setAccountStatus] = useState<"missing" | "pending" | "verified" | "rejected">("missing");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [a, p] = await Promise.all([
        supabase.from("contractor_agreements").select("id").eq("user_id", user.id).limit(1).maybeSingle(),
        supabase.from("payout_accounts").select("status").eq("user_id", user.id).maybeSingle(),
      ]);
      setHasAgreement(!!a.data);
      const s = (p.data as any)?.status as string | undefined;
      setAccountStatus(s === "verified" ? "verified" : s === "rejected" ? "rejected" : s === "pending" ? "pending" : "missing");
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <Card><CardContent className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></CardContent></Card>
    );
  }

  const ready = hasAgreement && accountStatus === "verified";

  const StepRow = ({ done, label, hint }: { done: boolean; label: string; hint?: string }) => (
    <div className="flex items-start gap-2 text-sm">
      {done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" /> : <Circle className="w-4 h-4 text-muted-foreground mt-0.5" />}
      <div>
        <div className={done ? "" : "text-muted-foreground"}>{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Tasker payout setup
          {ready && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 ml-2" variant="outline">Ready</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <StepRow done={hasAgreement} label="1. Independent Contractor Agreement" />
        <StepRow
          done={accountStatus !== "missing"}
          label="2. Payment Details"
          hint={accountStatus === "pending" ? "Pending verification" : accountStatus === "rejected" ? "Rejected — please update" : undefined}
        />
        <StepRow done={accountStatus === "verified"} label="3. Admin verification" />
        <StepRow done={ready} label="4. Ready to receive payouts" />

        <div className="pt-2">
          {!hasAgreement ? (
            <Button asChild className="w-full sm:w-auto">
              <Link to="/contractor-agreement">
                <FileSignature className="w-4 h-4 mr-2" /> Sign Contractor Agreement
              </Link>
            </Button>
          ) : accountStatus === "missing" ? (
            <Button asChild className="w-full sm:w-auto">
              <Link to="/contractor-payments">
                <ShieldCheck className="w-4 h-4 mr-2" /> Add payment details
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link to="/contractor-payments">Manage payout details</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TaskerPayoutSetup;