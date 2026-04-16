import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Shield } from 'lucide-react';

export default function AdminAuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

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
