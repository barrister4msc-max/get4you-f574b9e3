import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Trash2, Download, Search, MessageSquare, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { exportToCsv } from '@/lib/exportCsv';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { getMinPrice, formatMinPriceMessage } from '@/lib/pricing';

export default function AdminOrders() {
  const { t, currency } = useLanguage();
  const { user } = useAuth();
  const formatPrice = useFormatPrice();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [escrowMap, setEscrowMap] = useState<Record<string, { net: number; commission: number; total: number }>>({});
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    const userIds = [...new Set((data || []).flatMap(t => [t.user_id, t.assigned_to].filter((x): x is string => Boolean(x))))];
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, email').in('user_id', userIds);
    const nameMap = Object.fromEntries(
      (profiles || []).map(p => [p.user_id, p.display_name || p.email || null])
    );

    setTasks((data || []).map(t => ({
      ...t,
      ownerName: t.user_id ? (nameMap[t.user_id] || '—') : '—',
      performerName: t.assigned_to ? (nameMap[t.assigned_to] || '—') : '—',
    })));

    const taskIds = (data || []).map(t => t.id);
    if (taskIds.length) {
      const { data: escrows } = await supabase
        .from('escrow_transactions')
        .select('task_id, amount, commission_amount, net_amount, currency, status')
        .in('task_id', taskIds);
      const map: Record<string, { net: number; commission: number; total: number; currency: string }> = {};
      (escrows || []).forEach((e: any) => {
        map[e.task_id] = {
          net: Number(e.net_amount),
          commission: Number(e.commission_amount),
          total: Number(e.amount),
          currency: e.currency,
        };
      });
      setEscrowMap(map as any);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const s = searchParams.get('status');
    if (s) setStatusFilter(s);
  }, [searchParams]);

  const onStatusChange = (v: string) => {
    setStatusFilter(v);
    if (v === 'all') searchParams.delete('status'); else searchParams.set('status', v);
    setSearchParams(searchParams, { replace: true });
  };

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

  const openEdit = (task: any) => {
    setEditing(task);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      category_id: task.category_id || '',
      address: task.address || '',
      city: task.city || '',
      scheduled_at: task.scheduled_at ? task.scheduled_at.slice(0, 16) : '',
      status: task.status || 'open',
      currency: task.currency || 'USD',
      budget_fixed: task.budget_fixed ?? task.budget_min ?? 0,
      admin_notes: task.admin_notes || '',
      assigned_to: task.assigned_to || '',
      reason: '',
    });
  };

  const saveEdit = async () => {
    if (!editing || !user) return;
    const oldPrice = Number(editing.budget_fixed ?? editing.budget_min ?? 0);
    const oldCurrency = editing.currency || 'USD';
    const newPrice = Number(editForm.budget_fixed) || 0;
    const newCurrency = editForm.currency || 'USD';
    const priceChanged = newPrice !== oldPrice || newCurrency !== oldCurrency;

    // Enforce min price ≥ $50 USD equivalent.
    const minAllowed = getMinPrice(newCurrency);
    if (newPrice > 0 && newPrice < minAllowed) {
      toast.error(formatMinPriceMessage(newCurrency));
      return;
    }

    // If the task already has escrow/payment records, warn and require a reason.
    if (priceChanged) {
      const hasEscrow = !!(escrowMap as any)[editing.id];
      if (hasEscrow) {
        const confirmed = window.confirm(
          'This task already has payment records. Changing the price may require manual payment adjustment. Continue?'
        );
        if (!confirmed) return;
      }
      if (!editForm.reason?.trim()) {
        toast.error('Please provide a reason for the price change.');
        return;
      }
    }

    setSaving(true);
    const patch: any = {
      title: editForm.title.trim() || null,
      description: editForm.description?.trim() || null,
      address: editForm.address?.trim() || null,
      city: editForm.city?.trim() || null,
      scheduled_at: editForm.scheduled_at ? new Date(editForm.scheduled_at).toISOString() : null,
      status: editForm.status,
      currency: newCurrency,
      budget_fixed: newPrice || null,
      admin_notes: editForm.admin_notes?.trim() || null,
    };
    if (editForm.category_id) patch.category_id = editForm.category_id;
    if (editForm.assigned_to) patch.assigned_to = editForm.assigned_to;

    const { error } = await supabase.from('tasks').update(patch).eq('id', editing.id);
    if (error) { setSaving(false); toast.error(error.message); return; }

    if (priceChanged) {
      const { error: auditErr } = await supabase.from('task_price_audit').insert({
        task_id: editing.id,
        admin_user_id: user.id,
        old_price: oldPrice,
        new_price: newPrice,
        old_currency: oldCurrency,
        new_currency: newCurrency,
        reason: editForm.reason?.trim() || null,
      });
      if (auditErr) console.warn('[admin] price audit insert failed', auditErr);
    }

    setSaving(false);
    setEditing(null);
    toast.success('Task updated.');
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
          { key: 'budget_fixed', label: t('admin.price') }, { key: 'currency', label: t('currency.usd') },
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
        <Select value={statusFilter} onValueChange={onStatusChange}>
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
              {statusFilter === 'completed' && <TableHead>{t('admin.commission') || 'Комиссия'}</TableHead>}
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
                <TableCell>
                  {(() => {
                    const e = (escrowMap as any)[t.id];
                    if (e) return formatPrice(e.total, currency, e.currency || t.currency);
                    const amount = t.budget_fixed ?? t.budget_min ?? 0;
                    return formatPrice(Number(amount) || 0, currency, t.currency);
                  })()}
                </TableCell>
                {statusFilter === 'completed' && (
                  <TableCell className="text-xs">
                    {(() => {
                      const e = (escrowMap as any)[t.id];
                      if (!e) return '—';
                      const pct = e.total > 0 ? Math.round((e.commission / e.total) * 100) : 0;
                      return <span className="text-primary font-semibold">{formatPrice(e.commission, currency, e.currency || t.currency)} ({pct}%)</span>;
                    })()}
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground text-xs">{format(new Date(t.created_at), 'dd.MM.yy')}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" asChild><Link to={`/tasks/${t.id}`}><Eye className="w-4 h-4" /></Link></Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" asChild><Link to={`/admin/chat?task=${t.id}`}><MessageSquare className="w-4 h-4" /></Link></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteTask(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={statusFilter === 'completed' ? 8 : 7} className="text-center text-muted-foreground py-8">{t('admin.noOrders')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 text-sm">
              <div>
                <Label className="text-xs">Title</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">City</Label>
                  <Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Address</Label>
                  <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Scheduled at</Label>
                  <Input type="datetime-local" value={editForm.scheduled_at} onChange={(e) => setEditForm({ ...editForm, scheduled_at: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['draft','open','awaiting_payment','in_progress','completion_requested','completed','cancelled'].map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Currency</Label>
                  <Select value={editForm.currency} onValueChange={(v) => setEditForm({ ...editForm, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ILS">ILS</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Price (min {getMinPrice(editForm.currency || 'USD')} {editForm.currency || 'USD'})</Label>
                  <Input
                    type="number"
                    min={getMinPrice(editForm.currency || 'USD')}
                    value={editForm.budget_fixed || ''}
                    onChange={(e) => setEditForm({ ...editForm, budget_fixed: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Assigned tasker (user_id)</Label>
                <Input value={editForm.assigned_to} onChange={(e) => setEditForm({ ...editForm, assigned_to: e.target.value })} placeholder="optional" />
              </div>
              <div>
                <Label className="text-xs">Admin notes</Label>
                <Textarea rows={2} value={editForm.admin_notes} onChange={(e) => setEditForm({ ...editForm, admin_notes: e.target.value })} />
              </div>
              {(escrowMap as any)[editing.id] && (
                <div className="text-xs p-3 rounded bg-amber-50 border border-amber-200 text-amber-800">
                  ⚠ This task already has payment records. Changing the price may require manual payment adjustment.
                </div>
              )}
              <div>
                <Label className="text-xs">Reason (required for price change)</Label>
                <Input value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} placeholder="Why are you changing the price?" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
