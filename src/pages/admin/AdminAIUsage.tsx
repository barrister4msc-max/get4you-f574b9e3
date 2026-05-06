import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download } from "lucide-react";

interface UsageRow {
  function_name: string;
  user_id: string;
  request_count: number;
  last_used: string;
}
interface DailyRow {
  day: string;
  function_name: string;
  request_count: number;
}
interface AlertRow {
  user_id: string;
  function_name: string;
  request_count: number;
  daily_limit: number;
  usage_ratio: number;
}

const csvEscape = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export default function AdminAIUsage() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<UsageRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: s }, { data: d }, { data: a }] = await Promise.all([
        supabase.rpc("get_ai_usage_stats", { _days: days }),
        supabase.rpc("get_ai_usage_daily", { _days: days }),
        supabase.rpc("get_ai_usage_alerts", { _threshold: 0.8 }),
      ]);
      if (cancelled) return;
      const rows = (s || []) as UsageRow[];
      setStats(rows);
      setDaily((d || []) as DailyRow[]);
      setAlerts((a || []) as AlertRow[]);
      const ids = [...new Set([
        ...rows.map((r) => r.user_id),
        ...((a || []) as AlertRow[]).map((x) => x.user_id),
      ])];
      if (ids.length > 0) {
        const { data: profs } = await supabase.rpc("get_public_profiles", { target_user_ids: ids });
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p.display_name || p.user_id.slice(0, 8); });
        setProfiles(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [days]);

  const totals = useMemo(() => {
    const total = stats.reduce((acc, r) => acc + Number(r.request_count), 0);
    const byFn = new Map<string, number>();
    stats.forEach((r) => byFn.set(r.function_name, (byFn.get(r.function_name) || 0) + Number(r.request_count)));
    const uniqueUsers = new Set(stats.map((r) => r.user_id)).size;
    return { total, byFn: Array.from(byFn.entries()).sort((a, b) => b[1] - a[1]), uniqueUsers };
  }, [stats]);

  const topUsers = useMemo(() => {
    const map = new Map<string, number>();
    stats.forEach((r) => map.set(r.user_id, (map.get(r.user_id) || 0) + Number(r.request_count)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [stats]);

  const exportStatsCsv = () => {
    const header = ["function_name", "user_id", "user_name", "request_count", "last_used"];
    const body = stats.map((r) => [
      r.function_name, r.user_id, profiles[r.user_id] || "", r.request_count, r.last_used,
    ]);
    downloadCsv(`ai-usage-stats-${days}d-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };
  const exportDailyCsv = () => {
    const header = ["day", "function_name", "request_count"];
    const body = daily.map((r) => [r.day, r.function_name, r.request_count]);
    downloadCsv(`ai-usage-daily-${days}d-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">AI Usage</h1>
        <div className="flex gap-2 items-center">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm rounded-md border ${days === d ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-secondary"}`}
            >
              {d === 1 ? "24h" : `${d}d`}
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={exportStatsCsv} disabled={loading || stats.length === 0}>
            <Download className="w-4 h-4 me-1" /> Stats CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportDailyCsv} disabled={loading || daily.length === 0}>
            <Download className="w-4 h-4 me-1" /> Daily CSV
          </Button>
        </div>
      </div>

      {alerts.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Limit alerts (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Function</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Limit</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((r, i) => {
                  const pct = Math.round(Number(r.usage_ratio) * 100);
                  const over = pct >= 100;
                  return (
                    <TableRow key={i}>
                      <TableCell>{profiles[r.user_id] || r.user_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.function_name.replace("task-assistant:", "")}</TableCell>
                      <TableCell className="text-right">{r.request_count}</TableCell>
                      <TableCell className="text-right">{r.daily_limit}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={over ? "destructive" : "secondary"}>{pct}%</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Total requests</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-foreground">{loading ? "…" : totals.total}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Unique users</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-foreground">{loading ? "…" : totals.uniqueUsers}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Functions</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {totals.byFn.map(([name, n]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="text-muted-foreground truncate">{name}</span>
                <Badge variant="secondary">{n}</Badge>
              </div>
            ))}
          </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Top 10 users</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>User</TableHead><TableHead className="text-right">Requests</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {topUsers.map(([uid, n]) => (
                <TableRow key={uid}>
                  <TableCell>{profiles[uid] || uid.slice(0, 8)}</TableCell>
                  <TableCell className="text-right">{n}</TableCell>
                </TableRow>
              ))}
              {topUsers.length === 0 && (
                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Daily breakdown</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Day</TableHead><TableHead>Function</TableHead><TableHead className="text-right">Count</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {daily.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.day}</TableCell>
                  <TableCell className="text-muted-foreground">{r.function_name}</TableCell>
                  <TableCell className="text-right">{r.request_count}</TableCell>
                </TableRow>
              ))}
              {daily.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}