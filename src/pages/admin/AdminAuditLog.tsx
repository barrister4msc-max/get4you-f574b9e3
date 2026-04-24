import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Shield, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

const WEBHOOK_ERROR_EVENTS = [
  'payment.webhook_signature_invalid',
  'payment.webhook_signature_missing',
  'payment.webhook_payload_mismatch',
  'payment.webhook_order_not_found',
  'payment.webhook_order_lookup_failed',
] as const;

const eventLabel: Record<string, string> = {
  'payment.webhook_signature_invalid': 'Неверная подпись',
  'payment.webhook_signature_missing': 'Подпись отсутствует',
  'payment.webhook_payload_mismatch': 'Расхождение payload',
  'payment.webhook_order_not_found': 'Заказ не найден',
  'payment.webhook_order_lookup_failed': 'Ошибка поиска заказа',
};

export default function AdminAuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      
      setLogs(data || []);

      // Fetch actor names
      const actorIds = [...new Set((data || []).map(l => l.actor_id))];
      if (actorIds.length > 0) {
        const { data: profs } = await supabase.rpc('get_public_profiles', { target_user_ids: actorIds });
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p.display_name || 'Unknown'; });
        setProfiles(map);
      }

      // Webhook errors from app_events for fast triage
      const { data: events } = await supabase
        .from('app_events')
        .select('id, event_type, entity_id, metadata, created_at')
        .in('event_type', [...WEBHOOK_ERROR_EVENTS])
        .order('created_at', { ascending: false })
        .limit(100);
      setWebhookEvents(events || []);

      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Аудит-лог</h1>
      </div>

      {/* Webhook errors panel */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">Ошибки Allpay webhook</h2>
          <Badge variant="secondary" className="text-xs">{webhookEvents.length}</Badge>
        </div>
        {webhookEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ошибок не зафиксировано.</p>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Тип ошибки</TableHead>
                  <TableHead>Allpay order</TableHead>
                  <TableHead>Заказ</TableHead>
                  <TableHead>Задача</TableHead>
                  <TableHead>Детали</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhookEvents.map((ev) => {
                  const md = ev.metadata || {};
                  const allpayId = md.allpay_order_id || '—';
                  const internalOrderId = md.internal_order_id || ev.entity_id;
                  const taskId = md.task_id;
                  const summary =
                    ev.event_type === 'payment.webhook_payload_mismatch'
                      ? `${md.amount_mismatch ? `сумма: ${md.payload_amount} vs ${md.order_amount}` : ''}${md.currency_mismatch ? ` валюта: ${md.payload_currency} vs ${md.order_currency}` : ''}`.trim() || JSON.stringify(md).slice(0, 80)
                      : ev.event_type === 'payment.webhook_signature_invalid'
                        ? `expected ${String(md.expected_sign || '').slice(0, 12)}… vs got ${String(md.incoming_sign || '').slice(0, 12)}…`
                        : JSON.stringify(md).slice(0, 80);
                  return (
                    <TableRow key={ev.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(ev.created_at), 'dd.MM.yy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs">
                          {eventLabel[ev.event_type] || ev.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{String(allpayId).slice(0, 18)}{String(allpayId).length > 18 ? '…' : ''}</TableCell>
                      <TableCell className="text-xs">
                        {internalOrderId ? (
                          <Link to={`/admin/orders?order=${internalOrderId}`} className="text-primary hover:underline font-mono">
                            {String(internalOrderId).slice(0, 8)}
                          </Link>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {taskId ? (
                          <Link to={`/tasks/${taskId}`} className="text-primary hover:underline font-mono">
                            {String(taskId).slice(0, 8)}
                          </Link>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={JSON.stringify(md)}>
                        {summary}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Журнал действий пуст</p>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Кто</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Детали</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.created_at), 'dd.MM.yy HH:mm')}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {profiles[log.actor_id] || log.actor_id?.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.action.includes('remove') || log.action.includes('ban') ? 'destructive' : 'secondary'} className="text-xs">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.target_type || '—'}</TableCell>
                  <TableCell className="text-xs max-w-[300px] truncate">
                    {log.details ? (
                      <span title={JSON.stringify(log.details)}>
                        {log.details.target_email || log.details.reason || JSON.stringify(log.details).slice(0, 80)}
                      </span>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
