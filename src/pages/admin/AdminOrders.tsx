import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-primary/10 text-primary',
  in_progress: 'bg-accent text-accent-foreground',
  completed: 'bg-primary/20 text-primary',
  cancelled: 'bg-destructive/10 text-destructive',
};

export default function AdminOrders() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    // Fetch profile names for owners and performers
    const userIds = [...new Set((data || []).flatMap(t => [t.user_id, t.assigned_to].filter(Boolean)))];
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
    const nameMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p.display_name]));

    setTasks((data || []).map(t => ({ ...t, ownerName: nameMap[t.user_id] || '—', performerName: t.assigned_to ? (nameMap[t.assigned_to] || '—') : '—' })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('tasks').update({ status } as any).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Статус обновлён');
    load();
  };

  const deleteTask = async (id: string) => {
    if (!confirm('Удалить заказ?')) return;
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Удалено');
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Заказы</h1>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Услуга</TableHead>
              <TableHead>Заказчик</TableHead>
              <TableHead>Исполнитель</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Цена</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium max-w-[200px] truncate">{t.title}</TableCell>
                <TableCell>{(t as any).owner?.display_name || '—'}</TableCell>
                <TableCell>{(t as any).performer?.display_name || '—'}</TableCell>
                <TableCell>
                  <Select value={t.status} onValueChange={(v) => updateStatus(t.id, v)}>
                    <SelectTrigger className="w-[130px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['draft', 'open', 'in_progress', 'completed', 'cancelled'].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{t.budget_fixed ?? `${t.budget_min || 0}–${t.budget_max || 0}`} {t.currency}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{format(new Date(t.created_at), 'dd.MM.yy')}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" asChild><Link to={`/tasks/${t.id}`}><Eye className="w-4 h-4" /></Link></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteTask(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {tasks.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Нет заказов</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
