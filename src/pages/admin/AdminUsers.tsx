import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ArrowUp, ArrowDown, ArrowUpDown, Download, Search } from 'lucide-react';
import { exportToCsv } from '@/lib/exportCsv';

type SortKey = 'user_number' | 'display_name' | 'email' | 'phone' | 'city' | 'created_at';
type SortDir = 'asc' | 'desc';

export default function AdminUsers() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const filtered = useMemo(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.display_name || '').toLowerCase().includes(q) ||
        String(u.user_number || '').includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [users, search, sortKey, sortDir]);

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
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('user_number')}>
                <span className="inline-flex items-center">ID<SortIcon col="user_number" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('display_name')}>
                <span className="inline-flex items-center">{t('admin.name')}<SortIcon col="display_name" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('email')}>
                <span className="inline-flex items-center">Email<SortIcon col="email" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('phone')}>
                <span className="inline-flex items-center">{t('admin.phone')}<SortIcon col="phone" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('city')}>
                <span className="inline-flex items-center">{t('admin.city')}<SortIcon col="city" /></span>
              </TableHead>
              <TableHead>{t('admin.roles')}</TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('created_at')}>
                <span className="inline-flex items-center">{t('admin.date')}<SortIcon col="created_at" /></span>
              </TableHead>
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
