import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Clock, FileSignature, Wallet, ShieldCheck, ArrowDownToLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PayoutAccount = {
  id: string;
  account_holder_name: string;
  id_number: string;
  bank_name: string | null;
  bank_number: string | null;
  branch_number: string | null;
  account_number: string | null;
  iban: string | null;
  swift_bic: string | null;
  tax_id: string | null;
  country: string;
  currency: string;
  status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
};

type WithdrawalRequest = {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "paid" | "rejected";
  rejection_reason: string | null;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
};

const maskAccount = (acc: string | null) => {
  if (!acc) return "—";
  if (acc.length <= 4) return `****${acc}`;
  return `****${acc.slice(-4)}`;
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    processing: "bg-blue-50 text-blue-700 border-blue-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  return map[status] || "bg-muted text-muted-foreground";
};

const ContractorPayments = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasAgreement, setHasAgreement] = useState(false);
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [balance, setBalance] = useState<{ available: number; currency: string }>({ available: 0, currency: "ILS" });
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState({
    account_holder_name: "",
    id_number: "",
    bank_name: "",
    bank_number: "",
    branch_number: "",
    account_number: "",
    iban: "",
    swift_bic: "",
    tax_id: "",
    country: "IL",
    currency: "ILS",
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [agreementRes, accountRes, balanceRes, requestsRes] = await Promise.all([
      supabase.from("contractor_agreements").select("id").eq("user_id", user.id).limit(1).maybeSingle(),
      supabase.from("payout_accounts").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("tasker_available_balance", { _user_id: user.id }),
      supabase.from("withdrawal_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);

    setHasAgreement(!!agreementRes.data);
    const acc = (accountRes.data as PayoutAccount | null) || null;
    setAccount(acc);
    if (acc) {
      setForm({
        account_holder_name: acc.account_holder_name || "",
        id_number: acc.id_number || "",
        bank_name: acc.bank_name || "",
        bank_number: acc.bank_number || "",
        branch_number: acc.branch_number || "",
        account_number: acc.account_number || "",
        iban: acc.iban || "",
        swift_bic: acc.swift_bic || "",
        tax_id: acc.tax_id || "",
        country: acc.country || "IL",
        currency: acc.currency || "ILS",
      });
    }
    const bal = Array.isArray(balanceRes.data) ? balanceRes.data[0] : balanceRes.data;
    if (bal) setBalance({ available: Number(bal.available || 0), currency: bal.currency || "ILS" });
    setRequests((requestsRes.data as WithdrawalRequest[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const hasOpenRequest = requests.some((r) => r.status === "pending" || r.status === "processing");

  const handleSubmitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.account_holder_name.trim() || !form.id_number.trim()) {
      toast.error("Please fill in account holder and ID number.");
      return;
    }
    if (form.country === "IL" && !form.account_number.trim()) {
      toast.error("Please fill in your Israeli bank account number.");
      return;
    }
    if (form.country === "CY" && (!form.iban.trim() || !form.swift_bic.trim())) {
      toast.error("Please fill in IBAN and SWIFT/BIC for Cyprus accounts.");
      return;
    }
    setSubmitting(true);
    const payload = {
      user_id: user.id,
      account_holder_name: form.account_holder_name.trim(),
      id_number: form.id_number.trim(),
      bank_name: form.bank_name.trim() || null,
      bank_number: form.bank_number.trim() || null,
      branch_number: form.branch_number.trim() || null,
      account_number: form.account_number.trim() || null,
      iban: form.iban.trim() || null,
      swift_bic: form.swift_bic.trim() || null,
      tax_id: form.tax_id.trim() || null,
      country: form.country || "IL",
      currency: form.currency || "ILS",
      status: "pending",
      provider: "manual",
      rejection_reason: null,
    };
    const { error } = await supabase.from("payout_accounts").upsert(payload, { onConflict: "user_id" });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Payout account submitted. Pending admin verification.");
    // Fire-and-forget notification + WhatsApp (uses existing infrastructure)
    try {
      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "payout_details_saved",
        title: "Payment details saved",
        message: "Your payout details have been saved and are pending admin verification.",
      });
      // enqueue_whatsapp requires a task_id (uuid). For this profile-level
      // event we only fire the in-app notification; WhatsApp dispatch for
      // payout-related task events is handled by release-escrow.
    } catch (_) { /* non-blocking */ }
    setEditing(false);
    await load();
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    const { data, error } = await supabase.rpc("request_withdrawal");
    setWithdrawing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as { ok: boolean; reason?: string; amount?: number };
    if (!result?.ok) {
      const reasons: Record<string, string> = {
        agreement_missing: "Please sign the contractor agreement first.",
        account_missing: "Please add payout account details.",
        account_pending: "Your payout account is pending verification.",
        account_rejected: "Your payout account was rejected.",
        account_not_verified: "Your payout account is not verified.",
        open_request_exists: "You already have a pending withdrawal request.",
        no_balance: "No available balance.",
      };
      toast.error(reasons[result?.reason || ""] || "Withdrawal failed.");
      return;
    }
    toast.success("Withdrawal request created. Admin will process it manually.");
    await load();
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const accountVerified = account?.status === "verified";
  const canWithdraw = hasAgreement && accountVerified && balance.available > 0 && !hasOpenRequest;

  return (
    <div className="min-h-[80vh] py-8">
      <div className="container max-w-3xl mx-auto px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Contractor Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">Set up your payout details to withdraw your earnings.</p>
        </div>

        {/* Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ChecklistItem ok={hasAgreement} label="Independent Contractor Agreement" />
            <ChecklistItem ok={!!account} label="Payout Account" />
            <ChecklistItem ok={accountVerified} label="Admin Verification" />
            <ChecklistItem
              ok={balance.available > 0}
              label={`Available Balance: ${balance.available.toFixed(2)} ${balance.currency}`}
            />
            <ChecklistItem ok={canWithdraw} label="Withdrawal Availability" />
          </CardContent>
        </Card>

        {/* Agreement section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="w-4 h-4" /> Independent Contractor Agreement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasAgreement ? (
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" /> Agreement signed
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertCircle className="w-5 h-5" /> Agreement not signed
                </div>
                <p className="text-sm text-muted-foreground">
                  Bank details become available after signing the agreement.
                </p>
                <Button asChild>
                  <Link to="/contractor-agreement">Sign Independent Contractor Agreement</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payout account section */}
        {hasAgreement && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Payout Account
              </CardTitle>
            </CardHeader>
            <CardContent>
              {account && !editing ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusBadge(account.status)}>
                      {account.status}
                    </Badge>
                    {account.status === "pending" && (
                      <span className="text-muted-foreground">Payout account pending admin verification.</span>
                    )}
                    {account.status === "verified" && (
                      <span className="text-emerald-700">Payout account verified.</span>
                    )}
                  </div>
                  {account.status === "rejected" && account.rejection_reason && (
                    <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">
                      Rejection reason: {account.rejection_reason}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Info label="Account holder" value={account.account_holder_name} />
                    <Info label="Bank" value={account.bank_name || "—"} />
                    <Info label="Country" value={account.country} />
                    <Info label="Currency" value={account.currency} />
                    <Info label="Account number" value={maskAccount(account.account_number)} />
                    {account.iban && <Info label="IBAN" value={maskAccount(account.iban)} />}
                    {account.tax_id && <Info label="Tax / Esek Patur" value={account.tax_id} />}
                  </div>
                  {(account.status === "rejected" || account.status === "pending") && (
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      Edit details
                    </Button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmitAccount} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Country *</Label>
                      <Select
                        value={form.country}
                        onValueChange={(v) =>
                          setForm({ ...form, country: v, currency: v === "CY" ? "EUR" : "ILS" })
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IL">Israel (ILS)</SelectItem>
                          <SelectItem value="CY">Cyprus (EUR)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Field label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Account holder name *" value={form.account_holder_name} onChange={(v) => setForm({ ...form, account_holder_name: v })} />
                    <Field label="ID number *" value={form.id_number} onChange={(v) => setForm({ ...form, id_number: v })} />
                    <Field label="Bank name" value={form.bank_name} onChange={(v) => setForm({ ...form, bank_name: v })} />
                    {form.country === "IL" ? (
                      <>
                        <Field label="Bank number" value={form.bank_number} onChange={(v) => setForm({ ...form, bank_number: v })} />
                        <Field label="Branch number *" value={form.branch_number} onChange={(v) => setForm({ ...form, branch_number: v })} />
                        <Field label="Account number *" value={form.account_number} onChange={(v) => setForm({ ...form, account_number: v })} />
                      </>
                    ) : (
                      <>
                        <Field label="IBAN *" value={form.iban} onChange={(v) => setForm({ ...form, iban: v })} />
                        <Field label="SWIFT/BIC *" value={form.swift_bic} onChange={(v) => setForm({ ...form, swift_bic: v })} />
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save payout account"}
                    </Button>
                    {account && (
                      <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Balance & withdraw */}
        {hasAgreement && account && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Available Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-extrabold text-primary">
                {balance.available.toFixed(2)} {balance.currency}
              </div>
              <Button onClick={handleWithdraw} disabled={!canWithdraw || withdrawing} className="w-full sm:w-auto">
                {withdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                Request withdrawal
              </Button>
              {!canWithdraw && (
                <p className="text-xs text-muted-foreground">
                  {!hasAgreement && "Please sign the contractor agreement first."}
                  {hasAgreement && !account && "Please add payout account details."}
                  {account?.status === "pending" && "Your payout account is pending verification."}
                  {account?.status === "rejected" && "Your payout account was rejected."}
                  {accountVerified && hasOpenRequest && "You already have a pending withdrawal request."}
                  {accountVerified && !hasOpenRequest && balance.available <= 0 && "No available balance."}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent requests */}
        {requests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent withdrawal requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="text-sm">
                    <div className="font-semibold">{Number(r.amount).toFixed(2)} {r.currency}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                    {r.rejection_reason && <div className="text-xs text-red-600 mt-1">Rejected: {r.rejection_reason}</div>}
                  </div>
                  <Badge variant="outline" className={statusBadge(r.status)}>{r.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

const ChecklistItem = ({ ok, label }: { ok: boolean; label: string }) => (
  <div className="flex items-center gap-2">
    {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-muted-foreground" />}
    <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
  </div>
);

const Info = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="font-medium">{value}</div>
  </div>
);

const Field = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

export default ContractorPayments;