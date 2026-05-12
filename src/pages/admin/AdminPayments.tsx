import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CreditCard, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

const PAYMENT_ERROR_EVENTS = [
  "payment.fetch_failed",
  "payment.allpay_error",
  "payment.order_update_failed",
  "payment.webhook_signature_invalid",
  "payment.webhook_signature_missing",
  "payment.webhook_payload_mismatch",
  "payment.webhook_order_not_found",
  "payment.webhook_order_lookup_failed",
] as const;

const errorLabel: Record<string, string> = {
  "payment.fetch_failed": "Allpay недоступен",
  "payment.allpay_error": "Ошибка Allpay",
  "payment.order_update_failed": "Не сохранён order",
  "payment.webhook_signature_invalid": "Неверная подпись",
  "payment.webhook_signature_missing": "Подпись отсутствует",
  "payment.webhook_payload_mismatch": "Расхождение payload",
  "payment.webhook_order_not_found": "Заказ не найден",
  "payment.webhook_order_lookup_failed": "Ошибка поиска заказа",
};

const statusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "succeeded" || status === "paid" || status === "completed") return "default";
  if (status === "failed" || status === "cancelled") return "destructive";
  return "secondary";
};

type Tab = "payments" | "errors";

export default function AdminPayments() {
  const [tab, setTab] = useState<Tab>("payments");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orders, setOrders] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const ordersQuery = supabase
        .from("orders")
        .select("id, user_id, task_id, amount, currency, status, provider_status, payment_url, allpay_order_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      const eventsQuery = supabase
        .from("app_events")
        .select("id, event_type, entity_id, metadata, created_at")
        .in("event_type", [...PAYMENT_ERROR_EVENTS])
        .order("created_at", { ascending: false })
        .limit(200);

      const [ordersRes, eventsRes] = await Promise.all([ordersQuery, eventsQuery]);
      setOrders(ordersRes.data || []);
      setErrors(eventsRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  const filteredOrders =
    statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  const failedOrdersCount = orders.filter((o) => o.status === "failed").length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Платежи</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setTab("payments")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === "payments" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Все платежи ({orders.length})
        </button>
        <button
          onClick={() => setTab("errors")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === "errors" ? "bg-destructive text-destructive-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Ошибки ({errors.length + failedOrdersCount})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === "payments" ? (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs text-muted-foreground">Статус:</span>
            {["all", "pending", "succeeded", "failed", "cancelled"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "all" ? "Все" : s}
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Allpay ID</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Задача</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(o.created_at), "dd.MM.yy HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{String(o.id).slice(0, 8)}</TableCell>
                    <TableCell className="text-xs font-mono">{String(o.allpay_order_id || "—").slice(0, 18)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {Number(o.amount).toFixed(2)} {o.currency}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(o.status)} className="text-xs">
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{o.provider_status || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {o.task_id ? (
                        <Link to={`/tasks/${o.task_id}`} className="text-primary hover:underline font-mono">
                          {String(o.task_id).slice(0, 8)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      Платежей не найдено
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-3 text-foreground">Failed orders ({failedOrdersCount})</h2>
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Allpay ID</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Задача</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders
                    .filter((o) => o.status === "failed")
                    .map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(o.created_at), "dd.MM.yy HH:mm")}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{String(o.id).slice(0, 8)}</TableCell>
                        <TableCell className="text-xs font-mono">{String(o.allpay_order_id || "—").slice(0, 18)}</TableCell>
                        <TableCell className="text-xs">
                          {Number(o.amount).toFixed(2)} {o.currency}
                        </TableCell>
                        <TableCell className="text-xs">
                          {o.task_id ? (
                            <Link to={`/tasks/${o.task_id}`} className="text-primary hover:underline font-mono">
                              {String(o.task_id).slice(0, 8)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  {failedOrdersCount === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        Нет проваленных заказов
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3 text-foreground">События ошибок ({errors.length})</h2>
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Детали</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((ev) => {
                    const md = ev.metadata || {};
                    const internalOrderId = md.internal_order_id || ev.entity_id;
                    const summary =
                      md.error_message ||
                      md.error_code ||
                      md.allpay_error ||
                      JSON.stringify(md).slice(0, 120);
                    return (
                      <TableRow key={ev.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(ev.created_at), "dd.MM.yy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-xs">
                            {errorLabel[ev.event_type] || ev.event_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {internalOrderId ? String(internalOrderId).slice(0, 8) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[420px] truncate" title={JSON.stringify(md)}>
                          {summary}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {errors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                        Ошибок не зафиксировано
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}