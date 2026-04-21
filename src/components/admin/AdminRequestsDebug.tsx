import { useEffect, useState } from 'react';
import { Activity, X, Trash2, RefreshCw } from 'lucide-react';
import {
  getRequestLog,
  subscribeRequestLog,
  clearRequestLog,
  type RequestLogEntry,
} from '@/lib/requestLogger';
import { cn } from '@/lib/utils';

const statusColor = (status: number) => {
  if (status === 0) return 'bg-destructive/10 text-destructive';
  if (status >= 500) return 'bg-destructive/10 text-destructive';
  if (status >= 400) return 'bg-amber-100 text-amber-700';
  if (status >= 200) return 'bg-emerald-100 text-emerald-700';
  return 'bg-muted text-muted-foreground';
};

const shortUrl = (url: string) => {
  // /rest/v1/orders?select=*&limit=20  → orders ?select=*&limit=20
  const m = url.match(/\/rest\/v1\/(rpc\/)?([^?]+)(\?.*)?$/);
  if (m) return `${m[1] ? 'rpc/' : ''}${m[2]}${m[3] || ''}`;
  return url;
};

export const AdminRequestsDebug = () => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RequestLogEntry[]>(getRequestLog());
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => subscribeRequestLog(setEntries), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed bottom-4 end-4 z-40 flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg transition-all hover:scale-105',
          open && 'scale-95'
        )}
        data-testid="admin-debug-toggle"
        title="Показать последние REST-запросы Supabase"
      >
        <Activity className="h-4 w-4" />
        Запросы
        {entries.length > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            {entries.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 end-4 z-40 flex h-[70vh] w-[min(640px,calc(100vw-2rem))] flex-col rounded-2xl border border-border bg-card shadow-2xl">
          <header className="flex items-center justify-between border-b border-border p-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Последние запросы Supabase</h3>
              <span className="text-xs text-muted-foreground">({entries.length}/50)</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEntries([...getRequestLog()])}
                className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Обновить"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={clearRequestLog}
                className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Очистить"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-2 text-xs">
            {entries.length === 0 ? (
              <p className="px-2 py-8 text-center text-muted-foreground">
                Пока нет запросов. Открой раздел /admin/orders или /admin/users — они появятся здесь.
              </p>
            ) : (
              <ul className="space-y-1">
                {entries.map((e) => {
                  const isOpen = expanded === e.id;
                  return (
                    <li
                      key={e.id}
                      className="rounded-lg border border-border bg-background"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 p-2 text-start"
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                      >
                        <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-bold', statusColor(e.status))}>
                          {e.status || 'ERR'}
                        </span>
                        <span className="font-mono text-[10px] font-bold text-muted-foreground">{e.method}</span>
                        <span className="flex-1 truncate font-mono text-[11px]" title={e.url}>
                          {shortUrl(e.url)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">{e.durationMs}ms</span>
                        {e.rowCount !== null && (
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
                              e.rowCount === 0 ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'
                            )}
                          >
                            {e.rowCount} rows
                          </span>
                        )}
                      </button>
                      {isOpen && (
                        <div className="space-y-1 border-t border-border p-2 font-mono text-[11px]">
                          <p className="text-muted-foreground">{e.startedAt}</p>
                          <p className="break-all"><strong>URL:</strong> {e.url}</p>
                          {e.contentRange && (
                            <p><strong>Content-Range:</strong> {e.contentRange}</p>
                          )}
                          {e.error && <p className="text-destructive"><strong>Error:</strong> {e.error}</p>}
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[10px]">
                            {e.responsePreview || '(пусто)'}
                          </pre>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-border p-2 text-[10px] text-muted-foreground">
            Подсказка: если строка показывает <strong>0 rows</strong>, но данные должны быть — это RLS блокирует доступ.
          </footer>
        </div>
      )}
    </>
  );
};