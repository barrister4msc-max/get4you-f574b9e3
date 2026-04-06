const STORAGE_KEY = 'task-translations';
const MAX_ENTRIES = 500;

interface CacheEntry {
  title: string;
  description: string | null;
  ts: number;
}

type Cache = Record<string, CacheEntry>;

function readCache(): Cache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  try {
    // Evict oldest entries if over limit
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
      sorted.slice(0, keys.length - MAX_ENTRIES).forEach(k => delete cache[k]);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage full — clear and retry
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}

export function makeKey(locale: string, taskId: string): string {
  return `${locale}:${taskId}`;
}

export function getCachedTranslation(locale: string, taskId: string): CacheEntry | null {
  const cache = readCache();
  return cache[makeKey(locale, taskId)] || null;
}

export function getCachedTranslations(locale: string, taskIds: string[]): Record<string, CacheEntry> {
  const cache = readCache();
  const result: Record<string, CacheEntry> = {};
  for (const id of taskIds) {
    const key = makeKey(locale, id);
    if (cache[key]) result[key] = cache[key];
  }
  return result;
}

export function setCachedTranslations(locale: string, translations: { id: string; title: string; description: string | null }[]) {
  const cache = readCache();
  const now = Date.now();
  for (const tr of translations) {
    cache[makeKey(locale, tr.id)] = { title: tr.title, description: tr.description, ts: now };
  }
  writeCache(cache);
}
