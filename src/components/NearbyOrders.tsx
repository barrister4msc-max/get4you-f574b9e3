import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { Link } from 'react-router-dom';
import { MapPin, Loader2, Filter, Globe2, Tag, Users, CheckCircle2 } from 'lucide-react';

interface NearbyTask {
  id: string;
  title: string | null;
  description: string | null;
  category_id: string | null;
  category_name_en: string | null;
  category_name_ru: string | null;
  category_name_he: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  budget_fixed: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  is_urgent: boolean | null;
  created_at: string;
  user_id: string;
  owner_language: string | null;
  distance_km: number | null;
}

interface CategoryRow {
  id: string;
  name_en: string;
  name_ru: string | null;
  name_he: string | null;
}

const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
const STORAGE_KEY = 'nearby_orders_radius_km';
const STORAGE_CAT = 'nearby_orders_category';
const STORAGE_LANG = 'nearby_orders_lang';
const LANGUAGES: { value: string; label: string }[] = [
  { value: '', label: 'Любой' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'he', label: 'עברית' },
  { value: 'ar', label: 'العربية' },
];

const readStored = (key: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) ?? fallback;
};

const readStoredRadius = (fallback: number): number => {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return RADIUS_OPTIONS.includes(parsed as any) ? parsed : fallback;
};

export const NearbyOrders = ({ defaultRadiusKm = 10 }: { defaultRadiusKm?: number }) => {
  const { t, currency, locale } = useLanguage();
  const { user } = useAuth();
  const formatPrice = useFormatPrice();
  const [radiusKm, setRadiusKm] = useState<number>(() => readStoredRadius(defaultRadiusKm));
  const [categoryId, setCategoryId] = useState<string>(() => readStored(STORAGE_CAT, ''));
  const [language, setLanguage] = useState<string>(() => readStored(STORAGE_LANG, ''));
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [tasks, setTasks] = useState<NearbyTask[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [proposalCounts, setProposalCounts] = useState<Record<string, number>>({});
  const [myProposalIds, setMyProposalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load categories once
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name_en, name_ru, name_he')
        .order('sort_order', { ascending: true });
      setCategories((data as CategoryRow[]) || []);
    })();
  }, []);

  // Geolocation (optional — tasks without coords still show)
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoDenied(true),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  // Fetch tasks when filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc('get_tasks_for_tasker', {
        user_lat: coords?.lat ?? null,
        user_lng: coords?.lng ?? null,
        radius_km: coords ? radiusKm : null,
        category_filter: categoryId || null,
        language_filter: language || null,
        result_limit: 30,
      });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setTasks([]);
        setProposalCounts({});
        setMyProposalIds(new Set());
      } else {
        setError(null);
        const list = (data as NearbyTask[]) || [];
        setTasks(list);

        // Load proposal counts + my proposals for this batch
        const taskIds = list.map((tsk) => tsk.id);
        if (taskIds.length > 0) {
          const { data: propsData } = await supabase
            .from('proposals')
            .select('task_id, user_id')
            .in('task_id', taskIds);
          if (!cancelled) {
            const counts: Record<string, number> = {};
            const mine = new Set<string>();
            (propsData || []).forEach((p: any) => {
              counts[p.task_id] = (counts[p.task_id] || 0) + 1;
              if (user && p.user_id === user.id) mine.add(p.task_id);
            });
            setProposalCounts(counts);
            setMyProposalIds(mine);
          }
        } else {
          setProposalCounts({});
          setMyProposalIds(new Set());
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [coords, radiusKm, categoryId, language, user?.id]);

  const handleRadiusChange = (value: number) => {
    setRadiusKm(value);
    try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  };
  const handleCategoryChange = (value: string) => {
    setCategoryId(value);
    try { window.localStorage.setItem(STORAGE_CAT, value); } catch {}
  };
  const handleLanguageChange = (value: string) => {
    setLanguage(value);
    try { window.localStorage.setItem(STORAGE_LANG, value); } catch {}
  };

  const catName = (c: CategoryRow) => {
    if (locale === 'ru') return c.name_ru || c.name_en;
    if (locale === 'he') return c.name_he || c.name_en;
    return c.name_en;
  };

  const taskCatName = (task: NearbyTask) => {
    if (locale === 'ru') return task.category_name_ru || task.category_name_en;
    if (locale === 'he') return task.category_name_he || task.category_name_en;
    return task.category_name_en;
  };

  const taskBudget = (task: NearbyTask): number => {
    return Number(task.budget_fixed ?? task.budget_min ?? task.budget_max ?? 0);
  };

  const headerNote = useMemo(() => {
    if (geoDenied) return t('nearby.geoDeniedHint') || 'Геолокация отключена — показываем все доступные';
    if (!coords) return t('nearby.locating') || 'Определяем местоположение…';
    return null;
  }, [geoDenied, coords, t]);

  return (
    <div className="mb-6 p-4 rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          {t('nearby.title') || 'Заказы рядом со мной'}
        </h2>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleRadiusChange(r)}
              disabled={!coords}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 ${
                radiusKm === r && coords ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
          <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5"
          >
            <option value="">{t('nearby.allCategories') || 'Все категории'}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{catName(c)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
          <Globe2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      {headerNote && (
        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Filter className="w-3 h-3" /> {headerNote}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground py-3">{error}</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          {t('nearby.empty') || 'Подходящих задач не найдено'}
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Link
              key={task.id}
              to={`/tasks/${task.id}`}
              className="block p-3 rounded-xl border border-border bg-background hover:shadow-card-hover transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm truncate">
                      {task.title || t('nearby.untitled') || 'Без названия'}
                    </h3>
                    {task.is_urgent && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive">
                        {t('tasks.urgent') || 'Срочно'}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{task.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {task.category_name_en && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground">
                        {taskCatName(task)}
                      </span>
                    )}
                    {task.distance_km != null ? (
                      <span className="text-xs text-primary font-medium">
                        {task.distance_km.toFixed(1)} km{task.city ? ` · ${task.city}` : ''}
                      </span>
                    ) : task.city ? (
                      <span className="text-xs text-muted-foreground">{task.city}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('tasks.remote') || 'Без локации'}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(task.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {taskBudget(task) > 0 && (
                  <div className="text-primary font-bold text-sm shrink-0">
                    {formatPrice(taskBudget(task), currency, task.currency || 'ILS')}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
