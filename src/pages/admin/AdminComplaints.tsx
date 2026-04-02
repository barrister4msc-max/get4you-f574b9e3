import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  open: 'bg-destructive/10 text-destructive',
  reviewing: 'bg-accent text-accent-foreground',
  resolved: 'bg-primary/10 text-primary',
  closed: 'bg-muted text-muted-foreground',
};

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from('complaints').select('*').order('created_at', { ascending: false });
    const userIds = [...new Set((data || []).map((c) => c.user_id))];
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
    const nameMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p.display_name]));

    setComplaints((data || []).map((c) => ({ ...c, userName: nameMap[c.user_id] || '—' })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('complaints').update({ status }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Статус обновлён');
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Жалобы ({complaints.length})</h1>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {complaints.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.userName}</TableCell>
                <TableCell className="max-w-[250px] truncate">{c.reason}</TableCell>
                <TableCell>
                  <Select value={c.status} onValueChange={(v) => updateStatus(c.id, v)}>
                    <SelectTrigger className="w-[120px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['open', 'reviewing', 'resolved', 'closed'].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{format(new Date(c.created_at), 'dd.MM.yy')}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => updateStatus(c.id, 'resolved')}>
                    Решить
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {complaints.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Нет жалоб</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
