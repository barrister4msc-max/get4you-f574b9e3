import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Eye, RefreshCw } from "lucide-react";

type PayoutAccount = {
  id: string;
  user_id: string;
  account_holder_name: string;
  id_number: string;
  bank_name: string | null;
  bank_number: string | null;
  branch_number: string | null;
  account_number: string | null;
  iban: string | null;
  swift_bic: string | null;
  country: string;
  currency: string;
  status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  email?: string | null;
  display_name?: string | null;
};

type WithdrawalRequest = {
  id: string;
  user_id: string;
  payout_account_id: string | null;
  amount: number;
  net_amount: number;
  commission: number;
  currency: string;
  status: "pending" | "missing_payout_details" | "processing" | "paid" | "rejected" | "cancelled";
  admin_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  paid_at: string | null;
  task_id: string | null;
  task_title?: string | null;
  email?: string | null;
  display_name?: string | null;
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    missing_payout_details: "bg-orange-50 text-orange-700 border-orange-200",
    processing: "bg-blue-50 text-blue-700 border-blue-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-muted text-muted-foreground",
  };
  return map[status] || "bg-muted text-muted-foreground";
};

const AdminPayouts = () => {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);

  const [rejectAccount, setRejectAccount] = useState<PayoutAccount | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [rejectRequest, setRejectRequest] = useState<WithdrawalRequest | null>(null);
  const [rejectReqReason, setRejectReqReason] = useState("");

  const [markPaid, setMarkPaid] = useState<WithdrawalRequest | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const [details, setDetails] = useState<{ request: WithdrawalRequest; account: PayoutAccount | null; payouts: any[] } | null>(null);

  const enrichWithProfiles = async <T extends { user_id: string }>(rows: T[]): Promise<(T & { email?: string | null; display_name?: string | null })[]> => {
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profiles } = await supabase.from("profiles").select("user_id, email, display_name").in("user_id", userIds);
    const map = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    return rows.map((r) => ({ ...r, email: map.get(r.user_id)?.email ?? null, display_name: map.get(r.user_id)?.display_name ?? null }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [accRes, reqRes] = await Promise.all([
      supabase.from("payout_accounts").select("*").order("created_at", { ascending: false }),
      supabase
        .from("payouts")
        .select("id, user_id, task_id, payout_account_id, amount, net_amount, commission, currency, status, admin_note, rejection_reason, paid_at, created_at, tasks(title)")
        .in("status", ["pending", "missing_payout_details", "paid", "rejected"])
        .order("created_at", { ascending: false }),
    ]);
    const accs = await enrichWithProfiles((accRes.data as PayoutAccount[]) || []);
    const flatReqs = ((reqRes.data as any[]) || []).map((r) => ({
      ...r,
      task_title: r.tasks?.title ?? null,
    })) as WithdrawalRequest[];
    const reqs = await enrichWithProfiles(flatReqs);
    setAccounts(accs);
    setRequests(reqs);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const auditLog = async (action: string, target_type: string, target_id: string, details: Record<string, any>) => {
    try {
      await supabase.rpc("log_admin_payout_action", { _action: action, _target_type: target_type, _target_id: target_id, _details: details as any });
    } catch (e) {
      console.warn("[admin-payouts] audit log failed", e);
    }
  };

  const verifyAccount = async (acc: PayoutAccount) => {
    const { error } = await supabase
      .from("payout_accounts")
      .update({ status: "verified", rejection_reason: null })
      .eq("id", acc.id);
    if (error) return toast.error(error.message);
    await auditLog("payout_account_verified", "payout_account", acc.id, { user_id: acc.user_id });
    toast.success("Payout account verified");
    await load();
  };

  const doRejectAccount = async () => {
    if (!rejectAccount || !rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    const { error } = await supabase
      .from("payout_accounts")
      .update({ status: "rejected", rejection_reason: rejectReason.trim() })
      .eq("id", rejectAccount.id);
    if (error) return toast.error(error.message);
    await auditLog("payout_account_rejected", "payout_account", rejectAccount.id, {
      user_id: rejectAccount.user_id,
      reason: rejectReason.trim(),
    });
    toast.success("Payout account rejected");
    setRejectAccount(null);
    setRejectReason("");
    await load();
  };

  const doMarkPaid = async () => {
    if (!markPaid) return;
    if (!markPaid.payout_account_id) {
      toast.error("Contractor has no payout account yet");
      return;
    }
    const account = accounts.find((a) => a.id === markPaid.payout_account_id);
    if (!account || account.status !== "verified") {
      toast.error("Payout account must be verified");
      return;
    }
    const { error } = await supabase
      .from("payouts")
      .update({ status: "paid", paid_at: new Date().toISOString(), admin_note: adminNote.trim() || null })
      .eq("id", markPaid.id)
      .eq("status", "pending");
    if (error) return toast.error(error.message);
    await auditLog("withdrawal_marked_paid", "payout", markPaid.id, {
      user_id: markPaid.user_id,
      amount: markPaid.amount,
      currency: markPaid.currency,
      note: adminNote.trim() || null,
    });
    // Notify the tasker
    try {
      await supabase.from("notifications").insert({
        user_id: markPaid.user_id,
        type: "payout_paid",
        title: "Your payout has been marked as paid",
        message: `Your payout of ${Number(markPaid.net_amount ?? markPaid.amount).toFixed(2)} ${markPaid.currency} has been marked as paid.`,
        task_id: markPaid.task_id,
      });
    } catch (_) { /* best-effort */ }
    toast.success("Marked as paid");
    setMarkPaid(null);
    setAdminNote("");
    await load();
  };

  const doRejectRequest = async () => {
    if (!rejectRequest || !rejectReqReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    const { error } = await supabase
      .from("payouts")
      .update({
        status: "rejected",
        rejection_reason: rejectReqReason.trim(),
      })
      .eq("id", rejectRequest.id);
    if (error) return toast.error(error.message);
    await auditLog("withdrawal_rejected", "payout", rejectRequest.id, {
      user_id: rejectRequest.user_id,
      reason: rejectReqReason.trim(),
    });
    toast.success("Withdrawal rejected");
    setRejectRequest(null);
    setRejectReqReason("");
    await load();
  };

  const openDetails = async (r: WithdrawalRequest) => {
    let account: any = null;
    if (r.payout_account_id) {
      const { data } = await supabase
        .from("payout_accounts")
        .select("*")
        .eq("id", r.payout_account_id)
        .maybeSingle();
      account = data;
    }
    // Surface the single underlying payout for parity with the previous UI.
    const linked = [
      {
        amount: r.net_amount ?? r.amount,
        payout_id: r.id,
        payouts: {
          id: r.id,
          task_id: r.task_id,
          net_amount: r.net_amount,
          currency: r.currency,
          status: r.status,
          created_at: r.created_at,
        },
      },
    ];
    setDetails({ request: r, account, payouts: linked });
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payouts / Withdrawals</h1>
          <p className="text-sm text-muted-foreground">Verify contractor payout accounts and process manual withdrawals.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Payout Accounts ({accounts.length})</TabsTrigger>
          <TabsTrigger value="requests">Withdrawal Requests ({requests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Account holder</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No payout accounts</TableCell>
                    </TableRow>
                  )}
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.display_name || a.user_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">{a.email || "—"}</TableCell>
                      <TableCell>{a.account_holder_name}</TableCell>
                      <TableCell>{a.bank_name || "—"}</TableCell>
                      <TableCell>{a.country}</TableCell>
                      <TableCell>{a.currency}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadge(a.status)}>{a.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right space-x-2">
                        {a.status !== "verified" && (
                          <Button size="sm" variant="outline" onClick={() => verifyAccount(a)}>
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Verify
                          </Button>
                        )}
                        {a.status !== "rejected" && (
                          <Button size="sm" variant="outline" onClick={() => { setRejectAccount(a); setRejectReason(""); }}>
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                      <TableHead>Paid at</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No withdrawal requests</TableCell>
                    </TableRow>
                  )}
                  {requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.display_name || r.user_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">{r.email || "—"}</TableCell>
                      <TableCell className="font-semibold">{Number(r.amount).toFixed(2)}</TableCell>
                      <TableCell>{r.currency}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadge(r.status)}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{r.paid_at ? new Date(r.paid_at).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openDetails(r)}>
                          <Eye className="w-4 h-4 mr-1" /> Details
                        </Button>
                        {r.status === "pending" && r.payout_account_id && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => { setMarkPaid(r); setAdminNote(""); }}>
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Mark as Paid
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setRejectRequest(r); setRejectReqReason(""); }}>
                              <XCircle className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {r.status === "missing_payout_details" && (
                          <span className="text-xs text-orange-700">Awaiting contractor bank details</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject account dialog */}
      <Dialog open={!!rejectAccount} onOpenChange={(o) => !o && setRejectAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payout account</DialogTitle>
            <DialogDescription>Provide a clear reason. The contractor will see it and can resubmit.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectAccount(null)}>Cancel</Button>
            <Button onClick={doRejectAccount}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject request dialog */}
      <Dialog open={!!rejectRequest} onOpenChange={(o) => !o && setRejectRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject withdrawal request</DialogTitle>
            <DialogDescription>Provide a clear rejection reason.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReqReason} onChange={(e) => setRejectReqReason(e.target.value)} placeholder="Reason for rejection" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectRequest(null)}>Cancel</Button>
            <Button onClick={doRejectRequest}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as paid dialog */}
      <Dialog open={!!markPaid} onOpenChange={(o) => !o && setMarkPaid(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark withdrawal as paid</DialogTitle>
            <DialogDescription>
              Confirm that the bank transfer has already been completed. This only records the manual transfer — no money will be sent.
            </DialogDescription>
          </DialogHeader>
          {markPaid && (
            <div className="text-sm space-y-1">
              <div><strong>Amount:</strong> {Number(markPaid.amount).toFixed(2)} {markPaid.currency}</div>
              <div><strong>Contractor:</strong> {markPaid.email || markPaid.user_id}</div>
            </div>
          )}
          <Textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Optional admin note (transfer reference, etc.)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaid(null)}>Cancel</Button>
            <Button onClick={doMarkPaid}>Confirm — Mark as Paid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Withdrawal request details</DialogTitle>
          </DialogHeader>
          {details && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-xs text-muted-foreground">Contractor</div><div>{details.request.user_id}</div></div>
                <div><div className="text-xs text-muted-foreground">Status</div><Badge variant="outline" className={statusBadge(details.request.status)}>{details.request.status}</Badge></div>
                <div><div className="text-xs text-muted-foreground">Amount</div><div className="font-semibold">{Number(details.request.amount).toFixed(2)} {details.request.currency}</div></div>
                <div><div className="text-xs text-muted-foreground">Created</div><div>{new Date(details.request.created_at).toLocaleString()}</div></div>
                {details.request.processed_at && <div><div className="text-xs text-muted-foreground">Processed</div><div>{new Date(details.request.processed_at).toLocaleString()}</div></div>}
              </div>
              {details.account && (
                <div className="border-t pt-3">
                  <div className="font-semibold mb-2">Payout account</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Holder: {details.account.account_holder_name}</div>
                    <div>ID: {details.account.id_number}</div>
                    <div>Bank: {details.account.bank_name || "—"}</div>
                    <div>Bank #: {details.account.bank_number || "—"}</div>
                    <div>Branch: {details.account.branch_number || "—"}</div>
                    <div>Account: {details.account.account_number || "—"}</div>
                    <div>IBAN: {details.account.iban || "—"}</div>
                    <div>SWIFT: {details.account.swift_bic || "—"}</div>
                    <div>Country: {details.account.country}</div>
                    <div>Currency: {details.account.currency}</div>
                    <div>Status: {details.account.status}</div>
                  </div>
                </div>
              )}
              <div className="border-t pt-3">
                <div className="font-semibold mb-2">Linked payouts ({details.payouts.length})</div>
                <div className="space-y-1 max-h-64 overflow-auto">
                  {details.payouts.map((p, i) => (
                    <div key={i} className="text-xs p-2 rounded border border-border">
                      <div>Payout: {p.payouts?.id || p.payout_id}</div>
                      <div>Task: {p.payouts?.task_id}</div>
                      <div>Net: {Number(p.amount).toFixed(2)} {p.payouts?.currency}</div>
                      <div>Status: {p.payouts?.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPayouts;