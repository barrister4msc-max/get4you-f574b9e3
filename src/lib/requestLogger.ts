/**
 * Lightweight in-memory logger for outbound Supabase REST/RPC calls.
 * Wraps window.fetch ONCE so we can show the last N requests + responses
 * inside the admin debug panel without affecting production behavior.
 *
 * Only kept in memory (capped), never persisted. Captures only same-origin
 * Supabase calls to avoid leaking unrelated data.
 */

export interface RequestLogEntry {
  id: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  startedAt: string;
  rowCount: number | null;
  contentRange: string | null;
  responsePreview: string;
  error?: string;
}

const MAX_ENTRIES = 50;
const listeners = new Set<(entries: RequestLogEntry[]) => void>();
let entries: RequestLogEntry[] = [];
let installed = false;

const notify = () => listeners.forEach((cb) => cb(entries));

const push = (entry: RequestLogEntry) => {
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  notify();
};

export const getRequestLog = () => entries;

export const clearRequestLog = () => {
  entries = [];
  notify();
};

export const subscribeRequestLog = (cb: (entries: RequestLogEntry[]) => void) => {
  listeners.add(cb);
  cb(entries);
  return () => {
    listeners.delete(cb);
  };
};

export const installRequestLogger = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const supabaseHost = (() => {
    try {
      return new URL(import.meta.env.VITE_SUPABASE_URL || '').host;
    } catch {
      return '';
    }
  })();

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const started = performance.now();
    const startedAt = new Date().toISOString();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    let host = '';
    try { host = new URL(url).host; } catch { /* ignore */ }
    const isSupabase = host && supabaseHost && host === supabaseHost;

    try {
      const response = await originalFetch(input as RequestInfo, init);
      if (isSupabase) {
        const cloned = response.clone();
        const contentRange = response.headers.get('content-range');
        let rowCount: number | null = null;
        if (contentRange) {
          const m = contentRange.match(/\/(\d+|\*)$/);
          if (m && m[1] !== '*') rowCount = Number(m[1]);
        }
        let preview = '';
        try {
          const text = await cloned.text();
          preview = text.slice(0, 800);
          if (rowCount === null && text.startsWith('[')) {
            try { rowCount = (JSON.parse(text) as unknown[]).length; } catch { /* ignore */ }
          }
        } catch { /* ignore */ }

        push({
          id: crypto.randomUUID(),
          method,
          url: url.replace(/^https?:\/\/[^/]+/, ''),
          status: response.status,
          durationMs: Math.round(performance.now() - started),
          startedAt,
          rowCount,
          contentRange,
          responsePreview: preview,
        });
      }
      return response;
    } catch (err) {
      if (isSupabase) {
        push({
          id: crypto.randomUUID(),
          method,
          url: url.replace(/^https?:\/\/[^/]+/, ''),
          status: 0,
          durationMs: Math.round(performance.now() - started),
          startedAt,
          rowCount: null,
          contentRange: null,
          responsePreview: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  };
};