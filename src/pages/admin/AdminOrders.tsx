import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Trash2, Download, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { exportToCsv } from '@/lib/exportCsv';

export default function AdminOrders() {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

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
    toast.success(t('admin.statusUpdated'));
    load();
  };

  const deleteTask = async (id: string) => {
    if (!confirm(t('admin.deleteConfirm'))) return;
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(t('admin.deleted'));
    load();
  };

  const filtered = tasks.filter(t => {
    const matchesSearch = !search || t.title?.toLowerCase().includes(search.toLowerCase()) || t.ownerName?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('admin.orders')}</h1>
        <Button variant="outline" size="sm" onClick={() => exportToCsv('orders.csv', filtered, [
          { key: 'title', label: t('admin.service') }, { key: 'ownerName', label: t('admin.client') },
          { key: 'performerName', label: t('admin.performer') }, { key: 'status', label: t('admin.status') },
          { key: 'budget_fixed', label: t('admin.price') }, { key: 'currency', label: 'Currency' },
          { key: 'created_at', label: t('admin.date') },
        ])}><Download className="w-4 h-4 mr-2" />CSV</Button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('admin.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.allStatuses')}</SelectItem>
            {['draft', 'open', 'in_progress', 'completed', 'cancelled'].map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.service')}</TableHead>
              <TableHead>{t('admin.client')}</TableHead>
              <TableHead>{t('admin.performer')}</TableHead>
              <TableHead>{t('admin.status')}</TableHead>
              <TableHead>{t('admin.price')}</TableHead>
              <TableHead>{t('admin.date')}</TableHead>
              <TableHead>{t('admin.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium max-w-[200px] truncate">{t.title}</TableCell>
                <TableCell>{t.ownerName}</TableCell>
                <TableCell>{t.performerName}</TableCell>
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
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t('admin.noOrders')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
