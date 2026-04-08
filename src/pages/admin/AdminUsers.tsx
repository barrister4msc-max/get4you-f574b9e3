import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Download, Search } from 'lucide-react';
import { exportToCsv } from '@/lib/exportCsv';

export default function AdminUsers() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    const { data: allRoles } = await supabase.from('user_roles').select('*');
    const merged = (profiles || []).map((p) => ({
      ...p,
      roles: (allRoles || []).filter((r) => r.user_id === p.user_id).map((r) => r.role),
    }));
    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleRole = async (userId: string, role: string, hasRole: boolean) => {
    if (hasRole) {
      await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role as any);
    } else {
      await supabase.from('user_roles').insert({ user_id: userId, role: role as any });
    }
    toast.success(hasRole ? t('admin.roleRemoved').replace('{role}', role) : t('admin.roleAdded').replace('{role}', role));
    load();
  };

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q) ||
      String(u.user_number || '').includes(q)
    );
  });

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">{t('admin.users')} ({filtered.length})</h1>
        <Button variant="outline" size="sm" onClick={() => exportToCsv('users.csv', filtered, [
          { key: 'user_number', label: 'ID' }, { key: 'display_name', label: t('admin.name') }, { key: 'email', label: 'Email' },
          { key: 'phone', label: t('admin.phone') },
          { key: 'city', label: t('admin.city') }, { key: 'roles', label: t('admin.roles') },
          { key: 'created_at', label: t('admin.date') },
        ])}><Download className="w-4 h-4 mr-2" />CSV</Button>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by email, name or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>{t('admin.name')}</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>{t('admin.phone')}</TableHead>
              <TableHead>{t('admin.city')}</TableHead>
              <TableHead>{t('admin.roles')}</TableHead>
              <TableHead>{t('admin.date')}</TableHead>
              <TableHead>{t('admin.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{u.user_number || '—'}</TableCell>
                <TableCell className="font-medium">{u.display_name || '—'}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{u.email || '—'}</TableCell>
                <TableCell>{u.phone || '—'}</TableCell>
                <TableCell>{u.city || '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {u.roles.map((r: string) => (
                      <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{format(new Date(u.created_at), 'dd.MM.yy')}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {['client', 'tasker', 'admin'].map((role) => {
                      const has = u.roles.includes(role);
                      return (
                        <Button key={role} variant={has ? 'default' : 'outline'} size="sm" className="text-xs h-7"
                          onClick={() => toggleRole(u.user_id, role, has)}>{role}</Button>
                      );
                    })}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
