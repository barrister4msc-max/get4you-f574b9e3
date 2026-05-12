import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { RefreshCw, AlertTriangle, CreditCard, Lock, Unlock, Clock, DollarSign } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type ReconciliationRow = Database["public"]["Views"]["payment_reconciliation"]["Row"];

type SummaryData = {
  total_paid_orders: number;
  total_held_escrow: number;
  total_released_escrow: number;
  total_pending_payouts: number;
  total_mismatches: number;
  mismatches_by_type: Record<string, number>;
  generated_at: string;
} | null;

const mismatchBadgeVariant = (reason: string | null): "default" | "secondary" | "destructive" | "outline" => {
  if (!reason) return "outline";
  if (reason.includes("orphan") || reason.includes("mismatch")) return "destructive";
  if (reason.includes("without")) return "secondary";
  return "default";
};

export default function AdminReconciliation() {
  const [summary, setSummary] = useState<SummaryData>(null);
  const [mismatches, setMismatches] = useState<ReconciliationRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingMismatches, setLoadingMismatches] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const { data, error } = await supabase.rpc("get_payment_reconciliation_summary");
      if (error) throw error;
      if (data && typeof data === "object") {
        setSummary(data as unknown as SummaryData);
      }
    } catch (e) {
      console.error("Failed to load reconciliation summary:", e);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadMismatches = useCallback(async () => {
    setLoadingMismatches(true);
    try {
      const { data, error } = await supabase
        .from("payment_reconciliation")
        .select("*")
        .not("mismatch_reason", "is", null)
        .order("order_created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setMismatches((data as ReconciliationRow[]) || []);
    } catch (e) {
      console.error("Failed to load mismatches:", e);
    } finally {
      setLoadingMismatches(false);
    }
  }, []);

  const refresh = useCallback(() => {
    loadSummary();
    loadMismatches();
  }, [loadSummary, loadMismatches]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summaryCards = [
    {
      label: "Оплаченных заказов",
      value: summary?.total_paid_orders ?? 0,
      icon: CreditCard,
      color: "text-primary",
    },
    {
      label: "Удержано escrow",
      value: summary?.total_held_escrow ?? 0,
      icon: Lock,
      color: "text-amber-500",
    },
    {
      label: "Выпущено escrow",
      value: summary?.total_released_escrow ?? 0,
      icon: Unlock,
      color: "text-emerald-500",
    },
    {
      label: "Ожидают выплаты",
      value: summary?.total_pending_payouts ?? 0,
      icon: Clock,
      color: "text-blue-500",
    },
    {
      label: "Расхождений",
      value: summary?.total_mismatches ?? 0,
      icon: AlertTriangle,
      color: "text-destructive",
      highlight: (summary?.total_mismatches ?? 0) > 0,
    },
  ];

  const uniqueMismatchReasons = Array.from(new Set(mismatches.map((m) => m.mismatch_reason).filter(Boolean)));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DollarSign className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Сверка платежей</h1>
        </div>
        <button
          onClick={refresh}
          disabled={loadingSummary || loadingMismatches}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loadingSummary || loadingMismatches ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {summaryCards.map((card) => (
          <Card key={card.label} className={card.highlight ? "border-destructive/50" : undefined}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${card.highlight ? "text-destructive" : "text-foreground"}`}>
                {loadingSummary ? "—" : Number(card.value).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mismatch reasons breakdown */}
      {!loadingSummary && summary?.mismatches_by_type && Object.keys(summary.mismatches_by_type).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(summary.mismatches_by_type).map(([reason, count]) => (
            <Badge key={reason} variant="destructive" className="text-xs">
              {reason}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Mismatches Table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Расхождения {mismatches.length > 0 && `(${mismatches.length})`}
          </h2>
          {uniqueMismatchReasons.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {uniqueMismatchReasons.length} типов
            </span>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Task ID</TableHead>
              <TableHead>Escrow ID</TableHead>
              <TableHead>Payout ID</TableHead>
              <TableHead>Order amount</TableHead>
              <TableHead>Escrow amount</TableHead>
              <TableHead>Payout net</TableHead>
              <TableHead>Причина</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingMismatches ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : mismatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  Расхождений не найдено
                </TableCell>
              </TableRow>
            ) : (
              mismatches.map((row) => (
                <TableRow key={`${row.order_id}-${row.escrow_id}-${row.payout_id}`}>
                  <TableCell className="text-xs font-mono">
                    {row.order_id ? (
                      <Link to={`/admin/orders`} className="text-primary hover:underline">
                        {String(row.order_id).slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {row.task_id ? (
                      <Link to={`/tasks/${row.task_id}`} className="text-primary hover:underline">
                        {String(row.task_id).slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {row.escrow_id ? String(row.escrow_id).slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {row.payout_id ? String(row.payout_id).slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {row.order_amount !== null ? `${Number(row.order_amount).toFixed(2)} ${row.order_currency || ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {row.escrow_amount !== null ? Number(row.escrow_amount).toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {row.payout_net_amount !== null ? Number(row.payout_net_amount).toFixed(2) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={mismatchBadgeVariant(row.mismatch_reason)} className="text-xs whitespace-nowrap">
                      {row.mismatch_reason}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
