import { useState, useEffect, useMemo } from "react";
import { getCachedTranslation, setCachedTranslations, makeKey, isTranslatedCopyUsable } from "@/lib/translationCache";
import { Link, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { MapPin, Clock, Search, ImageIcon, SlidersHorizontal, X, Navigation } from "lucide-react";
import { NearbyOrders } from "@/components/NearbyOrders";
import { TasksMap } from "@/components/TasksMap";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  budget_fixed: number | null;
  budget_min: number | null;
  city: string | null;
  address: string | null;
  is_urgent: boolean | null;
  due_date: string | null;
  created_at: string;
  photos: string[] | null;
  status: string | null;
  category_id: string | null;
  currency: string | null;
  task_type: string | null;
  latitude: number | null;
  longitude: number | null;
  categories?: { name_en: string; name_ru: string | null; name_he: string | null } | null;
}

interface TranslatedTaskCopy {
  title: string;
  description: string | null;
}

interface TaskTranslationResult extends TranslatedTaskCopy {
  id: string;
}

const urgencyColors: Record<string, string> = {
  normal: "bg-secondary text-muted-foreground",
  urgent: "bg-red-50 text-red-600",
};

const statusColors: Record<string, string> = {
  open: "bg-emerald-50 text-primary",
  in_progress: "bg-amber-50 text-amber-600",
  completed: "bg-secondary text-muted-foreground",
};

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value || "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s+#.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCompetencyTerms(value: string | null | undefined): string[] {
  if (!value) return [];

  const phrases = value
    .split(/[\n,;|/]+/)
    .map((part) => normalizeSearchText(part))
    .filter((part) => part.length >= 3);

  const words = phrases.flatMap((part) =>
    part
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3),
  );

  return Array.from(new Set([...phrases, ...words]));
}

function getTaskRecommendationScore(
  task: TaskRow,
  competencyTerms: string[],
  preferredCategoryIds?: Set<string>,
): number {
  let score = 0;
  if (preferredCategoryIds && task.category_id && preferredCategoryIds.has(task.category_id)) {
    score += 10; // strong boost for matching categories
  }
  if (competencyTerms.length === 0) return score;

  const searchableText = normalizeSearchText(
    [task.title, task.description, task.categories?.name_en, task.categories?.name_ru, task.categories?.name_he]
      .filter(Boolean)
      .join(" "),
  );

  if (!searchableText) return 0;

  const searchableWords = new Set(searchableText.split(" "));

  return competencyTerms.reduce((acc, term) => {
    if (term.includes(" ") && searchableText.includes(term)) return acc + 4;
    if (searchableWords.has(term)) return acc + 2;
    if (searchableText.includes(term)) return acc + 1;
    return acc;
  }, score);
}

const TaskCard = ({
  task,
  i,
  currency,
  t,
  getCategoryName,
  showStatus,
  distanceKm,
  displayTitle,
  displayDescription,
}: any) => {
  const formatPrice = useFormatPrice();

  return (
    <motion.div
      key={task.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05 }}
    >
      <Link
        to={`/tasks/${task.id}`}
        className="block bg-card border border-border rounded-2xl p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
      >
        <div className="flex items-start gap-4">
          {task.photos && task.photos.length > 0 ? (
            <div className="w-20 h-20 rounded-xl overflow-hidden border border-border shrink-0">
              <img src={task.photos[0]} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl border border-border bg-secondary flex items-center justify-center shrink-0">
              <ImageIcon className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{displayTitle}</h3>
                {displayDescription && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{displayDescription}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                  {(task.city || task.address) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {task.city || task.address}
                    </span>
                  )}
                  {distanceKm != null && (
                    <span className="flex items-center gap-1 text-xs">
                      <Navigation className="w-3 h-3" />
                      {distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)} km`}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                  {getCategoryName(task) && (
                    <span className="bg-emerald-50 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                      {getCategoryName(task)}
                    </span>
                  )}
                  {showStatus && task.status && (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[task.status] || "bg-secondary text-muted-foreground"}`}
                    >
                      {t(`tasks.status.${task.status}`)}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-end shrink-0">
                <div className="text-lg font-bold text-primary">
                  {formatPrice(task.budget_fixed || task.budget_min || 0, currency, task.currency)}
                </div>
                <span
                  className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                    task.is_urgent ? urgencyColors.urgent : urgencyColors.normal
                  }`}
                >
                  {task.is_urgent ? t("task.urgency.urgent") : t("task.urgency.flexible")}
                </span>
                {task.latitude != null && task.longitude != null && (
                  <div className="mt-4 w-full h-[120px] rounded-xl overflow-hidden border border-border">
                    <iframe
                      width="100%"
                      height="100%"
                      loading="lazy"
                      style={{ border: 0 }}
                      src={`https://www.google.com/maps?q=${task.latitude},${task.longitude}&z=14&output=embed`}
                      title={`Map for ${task.title}`}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

const TasksPage = () => {
  const { t, currency, locale } = useLanguage();
  const { user, roles, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterBudgetMin, setFilterBudgetMin] = useState("");
  const [filterBudgetMax, setFilterBudgetMax] = useState("");
  const [filterRadius, setFilterRadius] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [myTasks, setMyTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<
    { id: string; name_en: string; name_ru: string | null; name_he: string | null }[]
  >([]);
  const [tab, setTab] = useState<"all" | "my">("all");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [translatedTasks, setTranslatedTasks] = useState<Record<string, TranslatedTaskCopy>>({});
  const [nearbyDistances, setNearbyDistances] = useState<Record<string, number>>({});

  const isTasker = roles.includes("executor") || roles.includes("tasker");
  const competencyTerms = useMemo(() => {
    if (!isTasker) return [];
    const skills = (profile as any)?.skills as string[] | null | undefined;
    const skillTerms = (skills || []).flatMap((s) => extractCompetencyTerms(s));
    const bioTerms = extractCompetencyTerms(profile?.bio);
    return Array.from(new Set([...skillTerms, ...bioTerms]));
  }, [isTasker, profile?.bio, (profile as any)?.skills]);
  const [preferredCategoryIds, setPreferredCategoryIds] = useState<Set<string>>(new Set());

  // Build the tasker's preferred categories from history (assigned + proposed tasks)
  useEffect(() => {
    if (!user || !isTasker) {
      setPreferredCategoryIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const [assignedRes, proposalsRes] = await Promise.all([
        supabase.from("tasks").select("category_id").eq("assigned_to", user.id),
        supabase.from("proposals").select("task_id").eq("user_id", user.id),
      ]);
      const ids = new Set<string>();
      (assignedRes.data || []).forEach((r: any) => r.category_id && ids.add(r.category_id));
      const taskIds = (proposalsRes.data || []).map((r: any) => r.task_id);
      if (taskIds.length) {
        const { data: catTasks } = await supabase.from("tasks").select("category_id").in("id", taskIds);
        (catTasks || []).forEach((r: any) => r.category_id && ids.add(r.category_id));
      }
      if (!cancelled) setPreferredCategoryIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isTasker]);

  const requestGeolocation = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
        if (!filterRadius) setFilterRadius("25");
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const nearbyLatParam = searchParams.get("lat");
  const nearbyLngParam = searchParams.get("lng");
  const nearbyLat = nearbyLatParam ? Number(nearbyLatParam) : NaN;
  const nearbyLng = nearbyLngParam ? Number(nearbyLngParam) : NaN;
  const hasNearbyQueryCoords =
    searchParams.get("nearby") === "1" && !Number.isNaN(nearbyLat) && !Number.isNaN(nearbyLng);

  useEffect(() => {
    if (hasNearbyQueryCoords) return;
    const p = profile as any;
    if (p?.latitude != null && p?.longitude != null) {
      setUserCoords({ lat: p.latitude, lng: p.longitude });
    }
  }, [hasNearbyQueryCoords, (profile as any)?.latitude, (profile as any)?.longitude]);

  // Handle ?nearby=1&lat=&lng= from homepage CTA — sort by distance ascending
  const [sortByDistance, setSortByDistance] = useState(false);
  useEffect(() => {
    if (searchParams.get("nearby") !== "1") return;
    setSortByDistance(true);
    if (hasNearbyQueryCoords) {
      setUserCoords({ lat: nearbyLat, lng: nearbyLng });
    } else if (!userCoords && navigator.geolocation) {
      requestGeolocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, hasNearbyQueryCoords, nearbyLat, nearbyLng]);

  useEffect(() => {
    const fetchData = async () => {
      // Public listing uses tasks_public (no precise address/coords for non-participants)
      const [tasksRes, catsRes] = await Promise.all([
        supabase
          .from("tasks_public" as any)
          .select("*, categories(name_en, name_ru, name_he)")
          .order("created_at", { ascending: false }),
        supabase.from("categories").select("id, name_en, name_ru, name_he").order("sort_order"),
      ]);

      setTasks((tasksRes.data as unknown as TaskRow[]) || []);
      setCategories(catsRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  // When we have user coords, hydrate task rows with coords from get_nearby_tasks RPC
  // (tasks_public hides precise lat/lng for privacy, so distance sort needs this enrichment)
  useEffect(() => {
    if (!userCoords) return;
    let cancelled = false;
    (async () => {
      setNearbyDistances({});
      const { data, error } = await supabase.rpc("get_nearby_tasks", {
        p_lat: userCoords.lat,
        p_lng: userCoords.lng,
        p_radius_km: 500,
      });
      if (cancelled || error || !data) return;
      const coordMap = new Map<string, { lat: number; lng: number }>();
      const distanceMap: Record<string, number> = {};
      (data as any[]).forEach((r) => {
        if (r.latitude != null && r.longitude != null) {
          coordMap.set(r.id, { lat: r.latitude, lng: r.longitude });
        }
        if (typeof r.distance_meters === "number") {
          distanceMap[r.id] = r.distance_meters / 1000;
        }
      });
      setNearbyDistances(distanceMap);
      setTasks((prev) =>
        prev.map((t) => {
          const c = coordMap.get(t.id);
          return c ? { ...t, latitude: c.lat, longitude: c.lng } : t;
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [userCoords?.lat, userCoords?.lng]);

  // Map URL ?category=<slug|id> → filterCat (UUID)
  useEffect(() => {
    const param = searchParams.get("category");
    if (!param || categories.length === 0) return;
    // exact id match
    const byId = categories.find((c) => c.id === param);
    if (byId) {
      setFilterCat(byId.id);
      return;
    }
    // slug match against name_en (lowercased, partial)
    const slug = param.toLowerCase();
    const slugAliases: Record<string, string[]> = {
      cleaning: ["cleaning"],
      moving: ["moving"],
      repair: ["repairs", "repair"],
      digital: ["design", "tech help", "digital"],
      consulting: ["psychology", "consulting"],
      delivery: ["delivery"],
      beauty: ["beauty"],
      tutoring: ["tutoring"],
    };
    const candidates = slugAliases[slug] || [slug];
    const match = categories.find((c) => candidates.some((cand) => c.name_en.toLowerCase().includes(cand)));
    if (match) setFilterCat(match.id);
  }, [searchParams, categories]);

  useEffect(() => {
    if (!user || !isTasker) return;
    const fetchMyTasks = async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*, categories(name_en, name_ru, name_he)")
        .eq("assigned_to", user.id)
        .in("status", ["in_progress", "open", "completed"])
        .order("created_at", { ascending: false });
      setMyTasks((data as TaskRow[]) || []);
    };
    fetchMyTasks();
  }, [user, isTasker]);

  const getCategoryName = (task: TaskRow) => {
    const cat = task.categories;
    if (!cat) return "";
    if (locale === "ru") return cat.name_ru || cat.name_en;
    if (locale === "he") return cat.name_he || cat.name_en;
    return cat.name_en;
  };

  const cities = [...new Set(tasks.map((task) => task.city).filter(Boolean))] as string[];
  const tasksForCurrentTab = tab === "my" ? myTasks : tasks;

  const getDisplayedTaskCopy = (task: TaskRow): TranslatedTaskCopy => {
    const key = makeKey(locale, task.id);
    const inState = translatedTasks[key];
    if (isTranslatedCopyUsable(locale, task.title, task.description, inState)) {
      return inState;
    }

    const cached = getCachedTranslation(locale, task.id);
    if (isTranslatedCopyUsable(locale, task.title, task.description, cached)) {
      return { title: cached!.title, description: cached!.description };
    }

    return { title: task.title, description: task.description };
  };

  useEffect(() => {
    const fromCache: Record<string, TranslatedTaskCopy> = {};
    for (const task of tasksForCurrentTab) {
      const key = makeKey(locale, task.id);
      if (!isTranslatedCopyUsable(locale, task.title, task.description, translatedTasks[key])) {
        const cached = getCachedTranslation(locale, task.id);
        if (isTranslatedCopyUsable(locale, task.title, task.description, cached)) {
          fromCache[key] = { title: cached!.title, description: cached!.description };
        }
      }
    }

    if (Object.keys(fromCache).length > 0) {
      setTranslatedTasks((prev) => ({ ...prev, ...fromCache }));
    }
  }, [locale, tasksForCurrentTab, translatedTasks]);

  useEffect(() => {
    const tasksNeedingTranslation = tasksForCurrentTab
      .filter((task) => task.title || task.description)
      .filter((task) => {
        const key = makeKey(locale, task.id);
        return (
          !isTranslatedCopyUsable(locale, task.title, task.description, translatedTasks[key]) &&
          !isTranslatedCopyUsable(locale, task.title, task.description, getCachedTranslation(locale, task.id))
        );
      });

    if (tasksNeedingTranslation.length === 0) return;

    let cancelled = false;

    const translateTasks = async () => {
      const { data, error } = await supabase.functions.invoke("ai-task-assistant", {
        body: {
          type: "translate_tasks",
          targetLocale: locale,
          tasks: tasksNeedingTranslation.map(({ id, title, description }) => ({ id, title, description })),
        },
      });

      if (cancelled || error || !data?.translations) return;

      const validTranslations = (data.translations as TaskTranslationResult[])
        .map((translation) => {
          const originalTask = tasksNeedingTranslation.find((task) => task.id === translation.id);
          if (!originalTask) return null;

          const nextCopy: TaskTranslationResult = {
            id: translation.id,
            title: translation.title || originalTask.title,
            description: translation.description ?? originalTask.description,
          };

          return isTranslatedCopyUsable(locale, originalTask.title, originalTask.description, nextCopy)
            ? nextCopy
            : null;
        })
        .filter((translation): translation is TaskTranslationResult => Boolean(translation));

      if (validTranslations.length === 0) return;

      setCachedTranslations(locale, validTranslations);
      setTranslatedTasks((prev) => {
        const next = { ...prev };
        validTranslations.forEach((translation) => {
          next[makeKey(locale, translation.id)] = {
            title: translation.title,
            description: translation.description,
          };
        });
        return next;
      });
    };

    translateTasks().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [locale, tasksForCurrentTab, translatedTasks]);

  const getTaskDistance = (task: TaskRow): number | null => {
    if (typeof nearbyDistances[task.id] === "number") return nearbyDistances[task.id];
    if (!userCoords || task.latitude == null || task.longitude == null) return null;
    return getDistanceKm(userCoords.lat, userCoords.lng, task.latitude, task.longitude);
  };

  const filtered = tasks.filter((task) => {
    if (filterCat && task.category_id !== filterCat) return false;
    if (search) {
      const displayedCopy = getDisplayedTaskCopy(task);
      const query = search.toLowerCase();
      const matches = [task.title, task.description || "", displayedCopy.title, displayedCopy.description || ""].some(
        (value) => value.toLowerCase().includes(query),
      );
      if (!matches) return false;
    }
    if (filterCity && task.city !== filterCity) return false;
    const budget = task.budget_fixed || task.budget_min || 0;
    if (filterBudgetMin && budget < Number(filterBudgetMin)) return false;
    if (filterBudgetMax && budget > Number(filterBudgetMax)) return false;
    if (filterRadius && userCoords) {
      const dist = getTaskDistance(task);
      if (dist === null) return false;
      if (dist > Number(filterRadius)) return false;
    }
    return true;
  });

  const sortedFiltered = [...filtered].sort((a, b) => {
    if (sortByDistance && userCoords) {
      const da = getTaskDistance(a);
      const db = getTaskDistance(b);
      if (da != null && db != null) return da - db;
      if (da != null) return -1;
      if (db != null) return 1;
    }
    const scoreDifference =
      getTaskRecommendationScore(b, competencyTerms, preferredCategoryIds) -
      getTaskRecommendationScore(a, competencyTerms, preferredCategoryIds);
    if (scoreDifference !== 0) return scoreDifference;

    const urgentDifference = Number(Boolean(b.is_urgent)) - Number(Boolean(a.is_urgent));
    if (urgentDifference !== 0) return urgentDifference;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const activeFilters = [filterCat, filterCity, filterBudgetMin, filterBudgetMax, filterRadius].filter(Boolean).length;

  const clearFilters = () => {
    setFilterCat("");
    setFilterCity("");
    setFilterBudgetMin("");
    setFilterBudgetMax("");
    setFilterRadius("");
    setSearch("");
  };

  const displayTasks = tab === "my" ? myTasks : sortedFiltered;

  return (
    <div className="py-8">
      <div className="container">
        <h1 className="text-2xl font-bold mb-6">{t("tasks.title")}</h1>

        <NearbyOrders defaultRadiusKm={10} />

        {tab === "all" && (
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-input bg-card text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">{t("task.category")}: {t("tasks.allTasks")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === "ru"
                      ? c.name_ru || c.name_en
                      : locale === "he"
                        ? c.name_he || c.name_en
                        : c.name_en}
                  </option>
                ))}
              </select>
              <select
                value={filterRadius}
                onChange={(e) => {
                  setFilterRadius(e.target.value);
                  if (e.target.value && !userCoords) requestGeolocation();
                }}
                className="px-3 py-1.5 rounded-lg border border-input bg-card text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">{t("tasks.filter.anyDistance")}</option>
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </select>
              {(filterCat || filterRadius) && (
                <button
                  onClick={() => {
                    setFilterCat("");
                    setFilterRadius("");
                  }}
                  className="flex items-center gap-1 text-xs text-destructive hover:underline"
                >
                  <X className="w-3 h-3" />
                  {t("tasks.filter.clear")}
                </button>
              )}
            </div>
            <TasksMap
              tasks={sortedFiltered.map((t) => ({
                id: t.id,
                title: t.title,
                latitude: t.latitude,
                longitude: t.longitude,
              }))}
              userLat={userCoords?.lat ?? null}
              userLng={userCoords?.lng ?? null}
              onRequestLocation={requestGeolocation}
              geoLoading={geoLoading}
              radiusKm={filterRadius ? Number(filterRadius) : null}
            />
          </div>
        )}

        {isTasker && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab("all")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("tasks.allTasks")}
            </button>
            <button
              onClick={() => setTab("my")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === "my"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("nav.myTasks")} ({myTasks.length})
            </button>
          </div>
        )}

        {tab === "all" && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={t("general.search")}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  showFilters || activeFilters > 0
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {t("tasks.filter")}
                {activeFilters > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {activeFilters}
                  </span>
                )}
              </button>
            </div>

            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 rounded-2xl border border-border bg-card space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t("task.category")}</label>
                    <select
                      value={filterCat}
                      onChange={(e) => setFilterCat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">{t("tasks.allTasks")}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {locale === "ru"
                            ? c.name_ru || c.name_en
                            : locale === "he"
                              ? c.name_he || c.name_en
                              : c.name_en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t("profile.city")}</label>
                    <select
                      value={filterCity}
                      onChange={(e) => setFilterCity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">{t("tasks.allTasks")}</option>
                      {cities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">
                      {t("tasks.filter.budgetFrom")}
                    </label>
                    <input
                      type="number"
                      value={filterBudgetMin}
                      onChange={(e) => setFilterBudgetMin(e.target.value)}
                      placeholder={currency === "ILS" ? "₪" : "$"}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">
                      {t("tasks.filter.budgetTo")}
                    </label>
                    <input
                      type="number"
                      value={filterBudgetMax}
                      onChange={(e) => setFilterBudgetMax(e.target.value)}
                      placeholder={currency === "ILS" ? "₪" : "$"}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">
                      {t("tasks.filter.radius")}
                    </label>
                    <div className="flex gap-1">
                      <select
                        value={filterRadius}
                        onChange={(e) => {
                          setFilterRadius(e.target.value);
                          if (e.target.value && !userCoords) requestGeolocation();
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        <option value="">{t("tasks.filter.anyDistance")}</option>
                        {RADIUS_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r} km
                          </option>
                        ))}
                      </select>
                      {!userCoords && (
                        <button
                          onClick={requestGeolocation}
                          disabled={geoLoading}
                          className="shrink-0 px-2 py-2 rounded-xl border border-input bg-background hover:bg-secondary transition-colors"
                          title={t("tasks.filter.detectLocation")}
                        >
                          <Navigation
                            className={`w-4 h-4 ${geoLoading ? "animate-pulse text-primary" : "text-muted-foreground"}`}
                          />
                        </button>
                      )}
                    </div>
                    {userCoords && (
                      <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                        <Navigation className="w-2.5 h-2.5" />
                        {t("tasks.filter.locationDetected")}
                      </p>
                    )}
                  </div>
                </div>
                {activeFilters > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-destructive hover:underline"
                  >
                    <X className="w-3 h-3" />
                    {t("tasks.filter.clear")}
                  </button>
                )}
              </motion.div>
            )}
          </>
        )}

        <div className="grid gap-4">
          {loading && <p className="text-center text-muted-foreground py-12">{t("dashboard.loading")}</p>}
          {!loading && displayTasks.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              {tab === "my" ? t("tasks.noMyTasks") : t("tasks.noResults")}
            </p>
          )}
          {displayTasks.map((task, i) => {
            const displayCopy = getDisplayedTaskCopy(task);
            return (
              <TaskCard
                key={task.id}
                task={task}
                i={i}
                currency={currency}
                t={t}
                getCategoryName={getCategoryName}
                showStatus={tab === "my"}
                distanceKm={tab === "all" ? getTaskDistance(task) : null}
                displayTitle={displayCopy.title}
                displayDescription={displayCopy.description}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TasksPage;
