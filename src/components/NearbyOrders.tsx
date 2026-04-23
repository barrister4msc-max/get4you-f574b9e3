import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, Loader2, Filter, Globe2, Tag, Users, CheckCircle2, ArrowDownUp } from 'lucide-react';

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
  user_id: string | null;
  owner_language: string | null;
  distance_km: number | null;
}

interface CategoryRow {
  id: string;
  name_en: string;
  name_ru: string | null;
  name_he: string | null;
}

interface PublicTaskRow {
  id: string;
  title: string | null;
  description: string | null;
  category_id: string | null;
  city: string | null;
  budget_fixed: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  is_urgent: boolean | null;
  created_at: string;
  user_id: string | null;
  categories?: CategoryRow | null;
}

interface NearbyRpcRow {
  id: string;
  latitude: number | null;
  longitude: number | null;
  distance_meters: number | null;
}

const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
const STORAGE_KEY = 'nearby_orders_radius_km';
const STORAGE_CAT = 'nearby_orders_category';
const STORAGE_LANG = 'nearby_orders_lang';
const STORAGE_SORT = 'nearby_orders_sort';

type SortMode = 'nearest' | 'least_proposals' | 'newest';

const readStored = (key: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) ?? fallback;
};

const readStoredRadius = (fallback: number): number => {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return RADIUS_OPTIONS.includes(parsed as (typeof RADIUS_OPTIONS)[number]) ? parsed : fallback;
};

export const NearbyOrders = ({ defaultRadiusKm = 10 }: { defaultRadiusKm?: number }) => {
  const { t, currency, locale } = useLanguage();
  const { user } = useAuth();
  const formatPrice = useFormatPrice();
  const [searchParams] = useSearchParams();
  const [radiusKm, setRadiusKm] = useState<number>(() => readStoredRadius(defaultRadiusKm));
  const [categoryId, setCategoryId] = useState<string>(() => readStored(STORAGE_CAT, ''));
  const [language, setLanguage] = useState<string>(() => readStored(STORAGE_LANG, ''));
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const v = readStored(STORAGE_SORT, 'nearest');
    return v === 'nearest' || v === 'least_proposals' || v === 'newest' ? v : 'nearest';
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [tasks, setTasks] = useState<NearbyTask[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [proposalCounts, setProposalCounts] = useState<Record<string, number>>({});
  const [myProposalIds, setMyProposalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryLat = Number(searchParams.get('lat'));
  const queryLng = Number(searchParams.get('lng'));
  const hasQueryCoords = searchParams.get('nearby') === '1' && !Number.isNaN(queryLat) && !Number.isNaN(queryLng);

  const anyLanguageLabel = useMemo(() => {
    if (locale === 'ru') return 'Любой';
    if (locale === 'he') return 'הכול';
    if (locale === 'ar') return 'الكل';
    return 'Any';
  }, [locale]);

  const languageOptions = useMemo(
    () => [
      { value: '', label: anyLanguageLabel },
      { value: 'ru', label: 'Русский' },
      { value: 'en', label: 'English' },
      { value: 'he', label: 'עברית' },
      { value: 'ar', label: 'العربية' },
    ],
    [anyLanguageLabel],
  );

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name_en, name_ru, name_he')
        .order('sort_order', { ascending: true });
      setCategories((data as CategoryRow[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (hasQueryCoords) {
      setCoords({ lat: queryLat, lng: queryLng });
      setGeoDenied(false);
      return;
    }

    if (!('geolocation' in navigator)) {
      setGeoDenied(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoDenied(false);
      },
      () => setGeoDenied(true),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, [hasQueryCoords, queryLat, queryLng]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchOwnerLanguages = async (userIds: string[]) => {
      if (userIds.length === 0) return new Map<string, string | null>();
      const uniqueUserIds = Array.from(new Set(userIds));
      const { data } = await supabase.rpc('get_public_profiles', { target_user_ids: uniqueUserIds });
      const map = new Map<string, string | null>();
      ((data as any[]) || []).forEach((row) => {
        map.set(row.user_id, row.preferred_language ?? null);
      });
      return map;
    };

    const loadTaskMeta = async (taskIds: string[]) => {
      if (taskIds.length === 0) return [] as NearbyTask[];

      const { data: publicRows, error: publicError } = await supabase
        .from('tasks_public' as any)
        .select('id, title, description, category_id, city, budget_fixed, budget_min, budget_max, currency, is_urgent, created_at, user_id, categories(name_en, name_ru, name_he)')
        .in('id', taskIds);

      if (publicError) throw publicError;

      const publicById = new Map<string, PublicTaskRow>(
        (((publicRows as any[]) || []) as PublicTaskRow[]).map((row) => [row.id, row]),
      );
      const ownerLanguages = await fetchOwnerLanguages(
        (((publicRows as any[]) || []) as PublicTaskRow[])
          .map((row) => row.user_id)
          .filter((value): value is string => Boolean(value)),
      );

      return taskIds
        .map((taskId) => {
          const row = publicById.get(taskId);
          if (!row) return null;
          return {
            id: row.id,
            title: row.title,
            description: row.description,
            category_id: row.category_id,
            category_name_en: row.categories?.name_en || null,
            category_name_ru: row.categories?.name_ru || null,
            category_name_he: row.categories?.name_he || null,
            city: row.city,
            latitude: null,
            longitude: null,
            budget_fixed: row.budget_fixed,
            budget_min: row.budget_min,
            budget_max: row.budget_max,
            currency: row.currency,
            is_urgent: row.is_urgent,
            created_at: row.created_at,
            user_id: row.user_id,
            owner_language: row.user_id ? ownerLanguages.get(row.user_id) ?? null : null,
            distance_km: null,
          } satisfies NearbyTask;
        })
        .filter((row): row is NearbyTask => Boolean(row));
    };

    (async () => {
      try {
        let list: NearbyTask[] = [];

        if (coords) {
          const { data: nearbyRows, error: nearbyError } = await supabase.rpc('get_nearby_tasks', {
            p_lat: coords.lat,
            p_lng: coords.lng,
            p_radius_km: radiusKm,
          });

          if (nearbyError) throw nearbyError;

          const ids = ((nearbyRows as NearbyRpcRow[]) || []).map((row) => row.id);
          const metaTasks = await loadTaskMeta(ids);
          const nearbyMap = new Map<string, NearbyRpcRow>(
            ((nearbyRows as NearbyRpcRow[]) || []).map((row) => [row.id, row]),
          );

          list = metaTasks.map((task) => {
            const nearbyRow = nearbyMap.get(task.id);
            return {
              ...task,
              latitude: nearbyRow?.latitude ?? null,
              longitude: nearbyRow?.longitude ?? null,
              distance_km:
                typeof nearbyRow?.distance_meters === 'number'
                  ? nearbyRow.distance_meters / 1000
                  : null,
            };
          });
        } else {
          let query = supabase
            .from('tasks_public' as any)
            .select('id, title, description, category_id, city, budget_fixed, budget_min, budget_max, currency, is_urgent, created_at, user_id, categories(name_en, name_ru, name_he)')
            .order('created_at', { ascending: false })
            .limit(30);

          if (categoryId) {
            query = query.eq('category_id', categoryId);
          }

          const { data: publicRows, error: publicError } = await query;
          if (publicError) throw publicError;

          const publicList = (((publicRows as any[]) || []) as PublicTaskRow[]);
          const ownerLanguages = await fetchOwnerLanguages(
            publicList.map((row) => row.user_id).filter((value): value is string => Boolean(value)),
          );

          list = publicList.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            category_id: row.category_id,
            category_name_en: row.categories?.name_en || null,
            category_name_ru: row.categories?.name_ru || null,
            category_name_he: row.categories?.name_he || null,
            city: row.city,
            latitude: null,
            longitude: null,
            budget_fixed: row.budget_fixed,
            budget_min: row.budget_min,
            budget_max: row.budget_max,
            currency: row.currency,
            is_urgent: row.is_urgent,
            created_at: row.created_at,
            user_id: row.user_id,
            owner_language: row.user_id ? ownerLanguages.get(row.user_id) ?? null : null,
            distance_km: null,
          }));
        }

        if (categoryId) {
          list = list.filter((task) => task.category_id === categoryId);
        }
        if (language) {
          list = list.filter((task) => task.owner_language === language);
        }

        if (cancelled) return;

        setError(null);
        setTasks(list);

        const taskIds = list.map((task) => task.id);
        if (taskIds.length > 0) {
          const { data: propsData } = await supabase
            .from('proposals')
            .select('task_id, user_id')
            .in('task_id', taskIds);

          if (!cancelled) {
            const counts: Record<string, number> = {};
            const mine = new Set<string>();
            (propsData || []).forEach((proposal: any) => {
              counts[proposal.task_id] = (counts[proposal.task_id] || 0) + 1;
              if (user && proposal.user_id === user.id) mine.add(proposal.task_id);
            });
            setProposalCounts(counts);
            setMyProposalIds(mine);
          }
        } else {
          setProposalCounts({});
          setMyProposalIds(new Set());
        }
      } catch (fetchError: any) {
        if (!cancelled) {
          setError(fetchError?.message || 'Failed to load nearby tasks');
          setTasks([]);
          setProposalCounts({});
          setMyProposalIds(new Set());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categoryId, coords, language, radiusKm, user?.id]);

  const handleRadiusChange = (value: number) => {
    setRadiusKm(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {}
  };

  const handleCategoryChange = (value: string) => {
    setCategoryId(value);
    try {
      window.localStorage.setItem(STORAGE_CAT, value);
    } catch {}
  };

  const handleLanguageChange = (value: string) => {
    setLanguage(value);
    try {
      window.localStorage.setItem(STORAGE_LANG, value);
    } catch {}
  };

  const handleSortChange = (value: SortMode) => {
    setSortMode(value);
    try {
      window.localStorage.setItem(STORAGE_SORT, value);
    } catch {}
  };

  const catName = (category: CategoryRow) => {
    if (locale === 'ru') return category.name_ru || category.name_en;
    if (locale === 'he') return category.name_he || category.name_en;
    return category.name_en;
  };

  const taskCatName = (task: NearbyTask) => {
    if (locale === 'ru') return task.category_name_ru || task.category_name_en;
    if (locale === 'he') return task.category_name_he || task.category_name_en;
    return task.category_name_en;
  };

  const taskBudget = (task: NearbyTask): number => Number(task.budget_fixed ?? task.budget_min ?? task.budget_max ?? 0);

  const headerNote = useMemo(() => {
    if (geoDenied) return t('nearby.geoDeniedHint') || 'Геолокация отключена — показываем доступные задачи';
    if (!coords) return t('nearby.locating') || 'Определяем местоположение…';
    return null;
  }, [coords, geoDenied, t]);

  const sortedTasks = useMemo(() => {
    const list = [...tasks];

    if (sortMode === 'least_proposals') {
      list.sort((a, b) => {
        const countA = proposalCounts[a.id] || 0;
        const countB = proposalCounts[b.id] || 0;
        if (countA !== countB) return countA - countB;
        const distanceA = a.distance_km ?? Number.POSITIVE_INFINITY;
        const distanceB = b.distance_km ?? Number.POSITIVE_INFINITY;
        if (distanceA !== distanceB) return distanceA - distanceB;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return list;
    }

    if (sortMode === 'newest') {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return list;
    }

    list.sort((a, b) => {
      const distanceA = a.distance_km ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distance_km ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [proposalCounts, sortMode, tasks]);

  return (
    <div className="mb-6 p-4 rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          {t('nearby.title') || 'Tasks nearby'}
        </h2>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {RADIUS_OPTIONS.map((radius) => (
            <button
              key={radius}
              type="button"
              onClick={() => handleRadiusChange(radius)}
              disabled={!coords}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 ${
                radiusKm === radius && coords ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {radius} km
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
          <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5"
          >
            <option value="">{t('nearby.allCategories') || 'All categories'}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {catName(category)}
              </option>
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
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-[170px]">
          <ArrowDownUp className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={sortMode}
            onChange={(e) => handleSortChange(e.target.value as SortMode)}
            className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5"
            title={t('nearby.sortHint') || 'Sort by'}
          >
            <option value="nearest">{t('nearby.sortNearest') || 'Nearest'}</option>
            <option value="least_proposals">{t('nearby.sortLeastProposals') || 'Fewest proposals'}</option>
            <option value="newest">{t('nearby.sortNewest') || 'Newest first'}</option>
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
      ) : sortedTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          {t('nearby.empty') || 'No matching tasks found'}
        </p>
      ) : (
        <div className="space-y-2">
          {sortedTasks.map((task) => (
            <Link
              key={task.id}
              to={`/tasks/${task.id}`}
              className="block p-3 rounded-xl border border-border bg-background hover:shadow-card-hover transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm truncate">
                      {task.title || t('nearby.untitled') || 'Untitled'}
                    </h3>
                    {task.is_urgent && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive">
                        {t('tasks.urgent') || 'Urgent'}
                      </span>
                    )}
                    {myProposalIds.has(task.id) && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                        <CheckCircle2 className="w-3 h-3" />
                        {t('nearby.alreadyApplied') || 'Already applied'}
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
                        {task.distance_km < 1 ? `${Math.round(task.distance_km * 1000)} m` : `${task.distance_km.toFixed(1)} km`}
                        {task.city ? ` · ${task.city}` : ''}
                      </span>
                    ) : task.city ? (
                      <span className="text-xs text-muted-foreground">{task.city}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('tasks.remote') || 'Remote'}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(task.created_at).toLocaleDateString()}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Users className="w-3 h-3" />
                      {proposalCounts[task.id] || 0} {t('nearby.proposalsShort') || 'offers'}
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
