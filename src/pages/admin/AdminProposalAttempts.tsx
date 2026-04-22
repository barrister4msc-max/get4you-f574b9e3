import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Bug, RefreshCw, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

type Attempt = {
  id: string;
  user_id: string | null;
  task_id: string | null;
  price: number | null;
  currency: string | null;
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  proposal_id: string | null;
  user_roles: string[] | null;
  context: any;
  created_at: string;
};

export default function AdminProposalAttempts() {
  const [rows, setRows] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'fail'>('fail');
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('proposal_attempts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    const list: Attempt[] = data || [];
    setRows(list);

    const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean) as string[])];
    if (ids.length) {
      const { data: profs } = await supabase.rpc('get_public_profiles', { target_user_ids: ids });
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => {
        map[p.user_id] = p.display_name || p.user_id?.slice(0, 8) || 'Unknown';
      });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => {
    if (filter === 'success' && !r.success) return false;
    if (filter === 'fail' && r.success) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [
        r.user_id,
        r.task_id,
        r.error_code,
        r.error_message,
        profiles[r.user_id || ''],
        (r.user_roles || []).join(','),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: rows.length,
    success: rows.filter((r) => r.success).length,
    fail: rows.filter((r) => !r.success).length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Bug className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Попытки откликов</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 me-2" />
          Обновить
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Всего</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Успешно</div>
          <div className="text-2xl font-bold text-emerald-600">{stats.success}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">С ошибкой</div>
          <div className="text-2xl font-bold text-destructive">{stats.fail}</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'fail', 'success'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Все' : f === 'fail' ? 'Ошибки' : 'Успешные'}
          </Button>
        ))}
        <Input
          placeholder="Поиск по user_id, task_id, ошибке, роли..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Нет записей</p>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Пользователь</TableHead>
                <TableHead>Роли</TableHead>
                <TableHead>Задача</TableHead>
                <TableHead>Цена</TableHead>
                <TableHead>Ошибка</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const isOpen = expanded === r.id;
                return (
                  <>
                    <TableRow
                      key={r.id}
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="cursor-pointer"
                    >
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(r.created_at), 'dd.MM.yy HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.success ? 'secondary' : 'destructive'} className="text-xs">
                          {r.success ? 'OK' : 'FAIL'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {r.user_id ? (
                          <span title={r.user_id}>
                            {profiles[r.user_id] || r.user_id.slice(0, 8)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {(r.user_roles || []).map((role) => (
                            <Badge key={role} variant="outline" className="text-[10px]">
                              {role}
                            </Badge>
                          )) || <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.task_id ? (
                          <Link
                            to={`/tasks/${r.task_id}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.task_id.slice(0, 8)}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.price != null ? `${r.price} ${r.currency || ''}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[280px]">
                        {r.error_code ? (
                          <div>
                            <Badge variant="destructive" className="text-[10px] mb-1">
                              {r.error_code}
                            </Badge>
                            <div className="truncate text-muted-foreground" title={r.error_message || ''}>
                              {r.error_message}
                            </div>
                          </div>
                        ) : (
                          <span className="text-emerald-600">
                            {r.proposal_id ? `→ ${r.proposal_id.slice(0, 8)}` : '—'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={r.id + '-details'}>
                        <TableCell colSpan={7} className="bg-muted/30">
                          <pre className="text-[11px] whitespace-pre-wrap break-all p-2">
                            {JSON.stringify(
                              {
                                id: r.id,
                                user_id: r.user_id,
                                task_id: r.task_id,
                                proposal_id: r.proposal_id,
                                price: r.price,
                                currency: r.currency,
                                success: r.success,
                                error_code: r.error_code,
                                error_message: r.error_message,
                                user_roles: r.user_roles,
                                context: r.context,
                                created_at: r.created_at,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        Журнал заполняется функцией <code>submit_proposal</code>: каждая попытка отклика (успех или сбой
        RLS / триггера / валидации) записывается с кодом ошибки и ролями пользователя для быстрой
        отладки.
      </p>
    </div>
  );
}