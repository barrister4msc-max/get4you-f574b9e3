import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

type Status = "pending" | "sent" | "failed" | "dead" | "processing";

interface Row {
  id: string;
  status: Status | string;
  event_type: string;
  phone: string | null;
  target_user_id: string | null;
  task_id: string | null;
  retry_count: number;
  error_message: string | null;
  provider_message_id: string | null;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
  next_retry_at: string | null;
}

const STATUS_FILTERS: Array<{ value: "all" | Status; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "dead", label: "Dead" },
];

const statusVariant = (s: string) => {
  switch (s) {
    case "sent":
      return "default" as const;
    case "failed":
      return "destructive" as const;
    case "dead":
      return "destructive" as const;
    case "pending":
    case "processing":
    default:
      return "secondary" as const;
  }
};

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const short = (s: string | null, n = 12) =>
  s ? (s.length > n ? `${s.slice(0, n)}…` : s) : "—";

export default function AdminWhatsappLogs() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [search, setSearch] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("whatsapp_logs")
      .select(
        "id,status,event_type,phone,target_user_id,task_id,retry_count,error_message,provider_message_id,created_at,sent_at,failed_at,next_retry_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data || []) as Row[]);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.id, r.phone, r.event_type, r.provider_message_id, r.error_message, r.target_user_id, r.task_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, sent: 0, failed: 0, dead: 0 };
    rows.forEach((r) => {
      c[r.status] = (c[r.status] || 0) + 1;
    });
    return c;
  }, [rows]);

  const resend = async (id: string) => {
    setResendingId(id);
    const { error } = await supabase.rpc("admin_resend_whatsapp", { p_log_id: id });
    setResendingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Queued for resend");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">WhatsApp Logs</h1>
        <div className="flex items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 me-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["pending", "sent", "failed", "dead"] as const).map((s) => (
          <Card key={s}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground">{s}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-foreground">{counts[s] || 0}</CardContent>
          </Card>
        ))}
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search phone, SID, event, error, IDs…"
        className="max-w-md h-9"
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent messages ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Retry</TableHead>
                <TableHead>Provider SID</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Sent / Failed</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.event_type}</TableCell>
                  <TableCell className="text-xs">{r.phone || "—"}</TableCell>
                  <TableCell className="text-right text-xs">{r.retry_count}</TableCell>
                  <TableCell className="text-xs font-mono" title={r.provider_message_id || ""}>
                    {short(r.provider_message_id, 14)}
                  </TableCell>
                  <TableCell className="text-xs text-destructive max-w-[260px] truncate" title={r.error_message || ""}>
                    {r.error_message || "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {r.sent_at ? `✓ ${fmt(r.sent_at)}` : r.failed_at ? `✗ ${fmt(r.failed_at)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resendingId === r.id || r.status === "pending" || r.status === "processing"}
                      onClick={() => resend(r.id)}
                    >
                      <Send className="w-3 h-3 me-1" />
                      Resend
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {loading ? "Loading…" : "No messages"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}