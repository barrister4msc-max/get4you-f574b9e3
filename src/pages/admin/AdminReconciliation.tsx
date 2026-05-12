import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  AlertTriangle,
  CreditCard,
  Lock,
  Unlock,
  Clock,
  DollarSign,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
} from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
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

type SortKey =
  | "order_created_at"
  | "order_amount"
  | "escrow_amount"
  | "payout_net_amount"
  | "mismatch_reason";

const PAGE_SIZE = 25;

const mismatchBadgeVariant = (
  reason: string | null,
): "default" | "secondary" | "destructive" | "outline" => {
  if (!reason) return "outline";
  if (reason.includes("orphan") || reason.includes("mismatch")) return "destructive";
  if (reason.includes("without")) return "secondary";
  return "default";
};

export default function AdminReconciliation() {
  const [summary, setSummary] = useState<SummaryData>(null);
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("__all__");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Sort + pagination
  const [sortKey, setSortKey] = useState<SortKey>("order_created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Detail dialog
  const [detailRow, setDetailRow] = useState<ReconciliationRow | null>(null);

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

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const { data, error } = await supabase
        .from("payment_reconciliation")
        .select("*")
        .not("mismatch_reason", "is", null)
        .order("order_created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRows((data as ReconciliationRow[]) || []);
    } catch (e) {
      console.error("Failed to load mismatches:", e);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  const refresh = useCallback(() => {
    loadSummary();
    loadRows();
  }, [loadSummary, loadRows]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const allReasons = useMemo(
    () => Array.from(new Set(rows.map((r) => r.mismatch_reason).filter(Boolean))) as string[],
    [rows],
  );

  // Apply filters
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return rows.filter((r) => {
      if (reasonFilter !== "__all__" && r.mismatch_reason !== reasonFilter) return false;
      if (fromTs !== null) {
        const t = r.order_created_at ? new Date(r.order_created_at).getTime() : null;
        if (t === null || t < fromTs) return false;
      }
      if (toTs !== null) {
        const t = r.order_created_at ? new Date(r.order_created_at).getTime() : null;
        if (t === null || t > toTs) return false;
      }
      if (q) {
        const hay = [r.order_id, r.task_id, r.escrow_id, r.payout_id]
          .map((v) => (v ? String(v).toLowerCase() : ""))
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, reasonFilter, dateFrom, dateTo]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, reasonFilter, dateFrom, dateTo, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-50" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1" />
    );
  };

  const handleExport = () => {
    const exportRows = sorted.map((r) => ({
      order_id: r.order_id ?? "",
      order_status: r.order_status ?? "",
      order_amount: r.order_amount ?? "",
      order_currency: r.order_currency ?? "",
      order_created_at: r.order_created_at ?? "",
      task_id: r.task_id ?? "",
      task_status: (r as Record<string, unknown>).task_status ?? "",
      escrow_id: r.escrow_id ?? "",
      escrow_status: r.escrow_status ?? "",
      escrow_amount: r.escrow_amount ?? "",
      payout_id: r.payout_id ?? "",
      payout_status: r.payout_status ?? "",
      payout_net_amount: r.payout_net_amount ?? "",
      mismatch_reason: r.mismatch_reason ?? "",
    }));
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    exportToCsv(`reconciliation-mismatches-${ts}.csv`, exportRows);
  };

  const summaryCards = [
    { label: "Оплаченных заказов", value: summary?.total_paid_orders ?? 0, icon: CreditCard, color: "text-primary" },
    { label: "Удержано escrow", value: summary?.total_held_escrow ?? 0, icon: Lock, color: "text-amber-500" },
    { label: "Выпущено escrow", value: summary?.total_released_escrow ?? 0, icon: Unlock, color: "text-emerald-500" },
    { label: "Ожидают выплаты", value: summary?.total_pending_payouts ?? 0, icon: Clock, color: "text-blue-500" },
    {
      label: "Расхождений",
      value: summary?.total_mismatches ?? 0,
      icon: AlertTriangle,
      color: "text-destructive",
      highlight: (summary?.total_mismatches ?? 0) > 0,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DollarSign className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Сверка платежей</h1>
        </div>
        <button
          onClick={refresh}
          disabled={loadingSummary || loadingRows}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loadingSummary || loadingRows ? "animate-spin" : ""}`} />
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

      {/* Filters */}
      <div className="rounded-lg border border-border bg-card p-4 mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по order/task/escrow/payout ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Тип расхождения" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Все типы</SelectItem>
            {allReasons.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Дата с"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Дата по"
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground">
          Показано {pageRows.length} из {sorted.length} (всего загружено {rows.length})
        </div>
        <div className="flex gap-2">
          {(search || reasonFilter !== "__all__" || dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setReasonFilter("__all__");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Сбросить
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} disabled={sorted.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Экспорт CSV
          </Button>
        </div>
      </div>

      {/* Mismatches Table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("order_created_at")}>
                Дата <SortIcon k="order_created_at" />
              </TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Task ID</TableHead>
              <TableHead>Escrow ID</TableHead>
              <TableHead>Payout ID</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("order_amount")}>
                Order amount <SortIcon k="order_amount" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("escrow_amount")}>
                Escrow <SortIcon k="escrow_amount" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("payout_net_amount")}>
                Payout net <SortIcon k="payout_net_amount" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("mismatch_reason")}>
                Причина <SortIcon k="mismatch_reason" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingRows ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                  Расхождений не найдено
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row, idx) => (
                <TableRow
                  key={`${row.order_id}-${row.escrow_id}-${row.payout_id}-${idx}`}
                  className="cursor-pointer"
                  onClick={() => setDetailRow(row)}
                >
                  <TableCell className="text-xs whitespace-nowrap">
                    {row.order_created_at
                      ? new Date(row.order_created_at as string).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {row.order_id ? String(row.order_id).slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {row.task_id ? String(row.task_id).slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {row.escrow_id ? String(row.escrow_id).slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {row.payout_id ? String(row.payout_id).slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {row.order_amount !== null
                      ? `${Number(row.order_amount).toFixed(2)} ${row.order_currency || ""}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {row.escrow_amount !== null ? Number(row.escrow_amount).toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {row.payout_net_amount !== null ? Number(row.payout_net_amount).toFixed(2) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={mismatchBadgeVariant(row.mismatch_reason)}
                      className="text-xs whitespace-nowrap"
                    >
                      {row.mismatch_reason}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs text-muted-foreground">
            Страница {page} из {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Вперёд
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Детали расхождения</DialogTitle>
            <DialogDescription>
              {detailRow?.mismatch_reason && (
                <Badge variant={mismatchBadgeVariant(detailRow.mismatch_reason)}>
                  {detailRow.mismatch_reason}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-4 text-sm">
              <DetailSection title="Order">
                <DetailRow label="ID" value={detailRow.order_id} mono link={detailRow.order_id ? `/admin/orders` : undefined} />
                <DetailRow label="Status" value={detailRow.order_status} />
                <DetailRow
                  label="Amount"
                  value={
                    detailRow.order_amount !== null
                      ? `${Number(detailRow.order_amount).toFixed(2)} ${detailRow.order_currency || ""}`
                      : null
                  }
                />
                <DetailRow
                  label="Created at"
                  value={
                    detailRow.order_created_at
                      ? new Date(detailRow.order_created_at as string).toLocaleString()
                      : null
                  }
                />
              </DetailSection>
              <DetailSection title="Task / Proposal">
                <DetailRow
                  label="Task ID"
                  value={detailRow.task_id}
                  mono
                  link={detailRow.task_id ? `/tasks/${detailRow.task_id}` : undefined}
                />
                <DetailRow
                  label="Task status"
                  value={(detailRow as Record<string, unknown>).task_status as string | null}
                />
                <DetailRow label="Proposal ID" value={detailRow.proposal_id} mono />
                <DetailRow label="Assigned to" value={detailRow.assigned_to} mono />
              </DetailSection>
              <DetailSection title="Escrow">
                <DetailRow label="ID" value={detailRow.escrow_id} mono />
                <DetailRow label="Status" value={detailRow.escrow_status} />
                <DetailRow
                  label="Amount"
                  value={detailRow.escrow_amount !== null ? Number(detailRow.escrow_amount).toFixed(2) : null}
                />
              </DetailSection>
              <DetailSection title="Payout">
                <DetailRow label="ID" value={detailRow.payout_id} mono />
                <DetailRow label="Status" value={detailRow.payout_status} />
                <DetailRow
                  label="Net amount"
                  value={
                    detailRow.payout_net_amount !== null
                      ? Number(detailRow.payout_net_amount).toFixed(2)
                      : null
                  }
                />
              </DetailSection>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  link?: string;
}) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className="flex justify-between gap-3 text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      {link && display !== "—" ? (
        <Link to={link} className={`text-primary hover:underline ${mono ? "font-mono" : ""}`}>
          {display}
        </Link>
      ) : (
        <span className={mono ? "font-mono" : ""}>{display}</span>
      )}
    </div>
  );
}