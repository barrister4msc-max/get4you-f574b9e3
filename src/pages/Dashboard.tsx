import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { LocationFallback } from "@/components/LocationFallback";
import { getCachedTranslation, setCachedTranslations, makeKey } from "@/lib/translationCache";
import {
  User,
  Search,
  ClipboardList,
  DollarSign,
  Briefcase,
  Star,
  Plus,
  ArrowRight,
  Wallet,
  ArrowDownToLine,
  Clock,
  CheckCircle2,
  MessageSquare,
  ShoppingCart,
  History,
} from "lucide-react";
import { NearbyOrders } from "@/components/NearbyOrders";
import { ProfileMap } from "@/components/ProfileMap";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useActiveRole } from "@/contexts/ActiveRoleContext";

interface ProposalRow {
  id: string;
  task_id: string;
  price: number;
  currency: string | null;
  status: string;
  created_at: string;
  task?: { title: string; status: string | null } | null;
}
interface MyTaskRow {
  id: string;
  title: string;
  status: string | null;
  budget_fixed: number | null;
  budget_min: number | null;
  currency: string | null;
  created_at: string;
}
interface EscrowRow {
  net_amount: number;
  currency: string;
  status: string;
  created_at: string;
  task?: { title: string } | null;
}
interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  task?: { title: string } | null;
}

interface OrderRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  payment_url: string | null;
  task?: { title: string } | null;
}

type Tab = "myTasks" | "findTasks" | "myProposals" | "earnings" | "rating" | "messages" | "orders";

const statusBadge = (status: string) => {
  const c: Record<string, string> = {
    open: "bg-emerald-50 text-primary",
    in_progress: "bg-amber-50 text-amber-600",
    completed: "bg-secondary text-muted-foreground",
    cancelled: "bg-red-50 text-red-600",
    draft: "bg-secondary text-muted-foreground",
    pending: "bg-amber-50 text-amber-600",
    accepted: "bg-emerald-50 text-primary",
    rejected: "bg-red-50 text-red-600",
  };
  return c[status] || "bg-secondary text-muted-foreground";
};

const DashboardPage = () => {
  const { t, currency, locale } = useLanguage();
  const formatPrice = useFormatPrice();
  const { user, profile, roles } = useAuth();

  const {
    latitude,
    longitude,
    loading: geoLoading,
    error: geoError,
    getCurrentLocation,
    permission: geoPermission,
    source: geoSource,
    label: geoLabel,
    searchAddress,
    setManualLocation,
    clearLocation,
  } = useGeolocation();

  const [radiusKm, setRadiusKm] = useState(20);
  const [nearbyTasks, setNearbyTasks] = useState<any[]>([]);
  const [searchedNearby, setSearchedNearby] = useState(false);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const loadNearbyTasks = async () => {
    try {
      setLoadingNearby(true);
      setSearchedNearby(true);
      setNearbyTasks([]);

      let lat = latitude;
      let lng = longitude;

      if (!lat || !lng) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        });

        lat = position.coords.latitude;
        lng = position.coords.longitude;
      }

      if (!lat || !lng) {
        setLoadingNearby(false);
        return;
      }

      const { data, error } = await supabase.rpc("get_nearby_tasks", {
        p_lat: lat,
        p_lng: lng,
        p_radius_km: radiusKm,
      });

      if (error) {
        console.error("Nearby tasks error:", error);
        setLoadingNearby(false);
        return;
      }

      setNearbyTasks(data || []);
      setLoadingNearby(false);
    } catch (error) {
      console.error("Geolocation error:", error);
      setLoadingNearby(false);
    }
  };

  const [tab, setTab] = useState<Tab>("myTasks");
  const [myTasks, setMyTasks] = useState<MyTaskRow[]>([]);
  const [translatedTitles, setTranslatedTitles] = useState<Record<string, string>>({});
  const [assignedTasks, setAssignedTasks] = useState<MyTaskRow[]>([]);
  const [myProposals, setMyProposals] = useState<ProposalRow[]>([]);
  const [escrowData, setEscrowData] = useState<EscrowRow[]>([]);
  const [allEscrow, setAllEscrow] = useState<EscrowRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [chatTasks, setChatTasks] = useState<
    { id: string; title: string; last_message: string | null; last_at: string | null }[]
  >([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { activeRole, setActiveRole, isClient, isTasker, hasBothRoles } = useActiveRole();
  const switchRole = (r: "client" | "tasker") => setActiveRole(r);
  const showTaskerBlocks = isTasker && activeRole === "tasker";
  const showClientBlocks = isClient && activeRole === "client";

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      setLoading(true);
      const [tasksRes, proposalsRes, releasedRes, allEscrowRes, reviewsRes, assignedRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, status, budget_fixed, budget_min, currency, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("proposals")
          .select("id, task_id, price, currency, status, created_at, tasks:task_id(title, status)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("escrow_transactions")
          .select("net_amount, currency, status, created_at, tasks:task_id(title)")
          .eq("tasker_id", user.id)
          .eq("status", "released"),
        supabase
          .from("escrow_transactions")
          .select("net_amount, currency, status, created_at, tasks:task_id(title)")
          .eq("tasker_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("reviews")
          .select("id, rating, comment, created_at, tasks:task_id(title)")
          .eq("reviewee_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("tasks")
          .select("id, title, status, budget_fixed, budget_min, currency, created_at")
          .eq("assigned_to", user.id)
          .order("created_at", { ascending: false }),
      ]);
      setMyTasks((tasksRes.data as MyTaskRow[]) || []);
      setAssignedTasks((assignedRes.data as MyTaskRow[]) || []);
      setMyProposals(
        (proposalsRes.data as any[])?.map((p) => ({ ...p, task: Array.isArray(p.tasks) ? p.tasks[0] : p.tasks })) || [],
      );
      setEscrowData(
        (releasedRes.data as any[])?.map((e) => ({ ...e, task: Array.isArray(e.tasks) ? e.tasks[0] : e.tasks })) || [],
      );
      setAllEscrow(
        (allEscrowRes.data as any[])?.map((e) => ({ ...e, task: Array.isArray(e.tasks) ? e.tasks[0] : e.tasks })) || [],
      );
      setReviews(
        (reviewsRes.data as any[])?.map((r) => ({ ...r, task: Array.isArray(r.tasks) ? r.tasks[0] : r.tasks })) || [],
      );

      // Fetch chat tasks - tasks where user has messages
      const { data: chatMsgs } = await supabase
        .from("chat_messages")
        .select("task_id, content, created_at")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (chatMsgs && chatMsgs.length > 0) {
        const taskIds = [...new Set(chatMsgs.map((m) => m.task_id))];
        const { data: chatTasksData } = await supabase.from("tasks").select("id, title").in("id", taskIds);
        const taskMap = new Map(chatTasksData?.map((t) => [t.id, t.title]) || []);
        const lastMsgMap = new Map<string, { content: string; created_at: string }>();
        chatMsgs.forEach((m) => {
          if (!lastMsgMap.has(m.task_id)) lastMsgMap.set(m.task_id, { content: m.content, created_at: m.created_at });
        });
        setChatTasks(
          taskIds
            .filter((id) => taskMap.has(id))
            .map((id) => ({
              id,
              title: taskMap.get(id)!,
              last_message: lastMsgMap.get(id)?.content || null,
              last_at: lastMsgMap.get(id)?.created_at || null,
            })),
        );
      }

      // Fetch orders
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, amount, currency, status, created_at, payment_url, tasks:task_id(title)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setOrders(
        (ordersData as any[])?.map((o) => ({ ...o, task: Array.isArray(o.tasks) ? o.tasks[0] : o.tasks })) || [],
      );

      setLoading(false);
    };
    fetchAll();
  }, [user]);

  useEffect(() => {
    const allTitles: { id: string; title: string }[] = [];
    const addUnique = (id: string, title: string) => {
      if (!allTitles.find((t) => t.id === id)) allTitles.push({ id, title });
    };
    myTasks.forEach((t) => addUnique(t.id, t.title));
    assignedTasks.forEach((t) => addUnique(t.id, t.title));
    myProposals.forEach((p) => {
      if (p.task?.title) addUnique(p.task_id, p.task.title);
    });
    allEscrow.forEach((e, i) => {
      if (e.task?.title) addUnique(`escrow-${i}`, e.task.title);
    });

    const fromCache: Record<string, string> = {};
    for (const t of allTitles) {
      const key = makeKey(locale, t.id);
      if (!translatedTitles[key]) {
        const cached = getCachedTranslation(locale, t.id);
        if (cached) fromCache[key] = cached.title;
      }
    }
    if (Object.keys(fromCache).length > 0) {
      setTranslatedTitles((prev) => ({ ...prev, ...fromCache }));
    }
  }, [locale, myTasks, assignedTasks, myProposals, allEscrow]);

  // Fetch missing translations from AI
  useEffect(() => {
    const allTitles: { id: string; title: string; description: string | null }[] = [];
    const addUnique = (id: string, title: string) => {
      if (!allTitles.find((t) => t.id === id)) allTitles.push({ id, title, description: null });
    };
    myTasks.forEach((t) => addUnique(t.id, t.title));
    assignedTasks.forEach((t) => addUnique(t.id, t.title));
    myProposals.forEach((p) => {
      if (p.task?.title) addUnique(p.task_id, p.task.title);
    });
    allEscrow.forEach((e, i) => {
      if (e.task?.title) addUnique(`escrow-${i}`, e.task.title);
    });

    const needTranslation = allTitles.filter((t) => {
      const key = makeKey(locale, t.id);
      return !translatedTitles[key] && !getCachedTranslation(locale, t.id);
    });

    if (needTranslation.length === 0) return;

    let cancelled = false;
    const doTranslate = async () => {
      const { data, error } = await supabase.functions.invoke("ai-task-assistant", {
        body: { type: "translate_tasks", targetLocale: locale, tasks: needTranslation },
      });
      if (cancelled || error || !data?.translations) return;
      setCachedTranslations(locale, data.translations);
      setTranslatedTitles((prev) => {
        const next = { ...prev };
        data.translations.forEach((tr: any) => {
          next[makeKey(locale, tr.id)] = tr.title;
        });
        return next;
      });
    };
    doTranslate().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [locale, myTasks, assignedTasks, myProposals, allEscrow]);

  const tt = (id: string, original: string) => translatedTitles[makeKey(locale, id)] || original;

  const totalEarnings = escrowData.reduce((sum, e) => sum + Number(e.net_amount), 0);
  const pendingEarnings = allEscrow
    .filter((e) => e.status === "held")
    .reduce((sum, e) => sum + Number(e.net_amount), 0);
  const avgRating =
    reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "myTasks", label: t("dashboard.client.myTasks"), icon: <ClipboardList className="w-4 h-4" /> },
    { key: "messages", label: t("chat.title") || "Chat", icon: <MessageSquare className="w-4 h-4" /> },
    { key: "orders", label: t("orders.title") || "Orders", icon: <ShoppingCart className="w-4 h-4" /> },
  ];
  if (showTaskerBlocks) {
    tabs.push({ key: "findTasks", label: t("dashboard.tasker.findTasks"), icon: <Search className="w-4 h-4" /> });
    tabs.push({
      key: "myProposals",
      label: t("dashboard.tasker.myProposals"),
      icon: <Briefcase className="w-4 h-4" />,
    });
    tabs.push({ key: "earnings", label: t("balance.title"), icon: <Wallet className="w-4 h-4" /> });
    tabs.push({ key: "rating", label: t("dashboard.rating"), icon: <Star className="w-4 h-4" /> });
  }

  const displayedTasks = showTaskerBlocks ? assignedTasks : myTasks;

  const handleWithdraw = () => {
    toast.success(t("balance.withdraw.success"));
  };

  return (
    <div className="min-h-[80vh] py-8">
      <div className="container max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-14 h-14 rounded-full object-cover shrink-0 border-2 border-border"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-emerald flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-primary-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{profile?.display_name || t("nav.dashboard")}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            {avgRating && (
              <button
                type="button"
                onClick={() => setTab("rating")}
                className="flex items-center gap-1 mt-0.5 hover:opacity-80 transition-opacity"
                title={t("dashboard.rating")}
              >
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span className="text-sm font-semibold">{avgRating}</span>
                <span className="text-xs text-muted-foreground">({reviews.length})</span>
              </button>
            )}
          </div>
          <Link to="/profile" className="text-xs text-primary font-medium hover:underline shrink-0">
            {t("nav.profile")} →
          </Link>
        </div>

        {/* Role indicator / switcher */}
        {isTasker || isClient ? (
          <div className="mb-5 p-3 rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground">Активная роль:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {activeRole === "tasker" ? (
                    <>
                      <Briefcase className="w-3.5 h-3.5" /> Исполнитель
                    </>
                  ) : (
                    <>
                      <ClipboardList className="w-3.5 h-3.5" /> Заказчик
                    </>
                  )}
                </span>
              </div>
              {hasBothRoles && (
                <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => switchRole("client")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      activeRole === "client"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Заказчик
                  </button>
                  <button
                    type="button"
                    onClick={() => switchRole("tasker")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      activeRole === "tasker"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Исполнитель
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setTab("myTasks")}
            className="p-3 rounded-2xl border border-border bg-card text-center hover:border-primary hover:shadow-card-hover transition-all"
          >
            <p className="text-xl font-bold text-primary">{displayedTasks.length}</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.client.myTasks")}</p>
          </button>
          <button
            type="button"
            onClick={() => (showTaskerBlocks ? setTab("myProposals") : setTab("myTasks"))}
            className="p-3 rounded-2xl border border-border bg-card text-center hover:border-primary hover:shadow-card-hover transition-all"
          >
            <p className="text-xl font-bold text-primary">{myProposals.length}</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.tasker.myProposals")}</p>
          </button>
          <button
            type="button"
            onClick={() => (showTaskerBlocks ? setTab("rating") : setTab("myTasks"))}
            className="p-3 rounded-2xl border border-border bg-card text-center hover:border-primary hover:shadow-card-hover transition-all"
          >
            <p className="text-xl font-bold text-primary">{avgRating || "—"}</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.rating")}</p>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap rounded-xl bg-muted p-1 mb-6 gap-1">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => {
                setTab(tb.key);
              }}
              className={`flex items-center gap-1.5 flex-1 min-w-0 py-2 px-2 rounded-lg text-xs font-semibold transition-all justify-center ${
                tab === tb.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {tb.icon}
              <span className="truncate hidden sm:inline">{tb.label}</span>
            </button>
          ))}
        </div>

        {/* MY TASKS */}

            {showTaskerBlocks && <NearbyOrders defaultRadiusKm={10} />}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">{t("dashboard.client.myTasks")}</h2>
              {isClient && (
                <Link
                  to="/create-task"
                  className="flex items-center gap-1 text-sm text-primary font-medium hover:underline"
                >
                  <Plus className="w-4 h-4" /> {t("dashboard.client.createTask")}
                </Link>
              )}
            </div>

            {isClient && isTasker && assignedTasks.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                  {t("dashboard.tasker.assignedTasks")}
                </h3>
                {assignedTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all mb-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{tt(task.id, task.title)}</h3>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(task.status || "draft")}`}
                        >
                          {t(`tasks.status.${task.status || "draft"}`)}
                        </span>
                      </div>
                      <div className="text-primary font-bold text-sm">
                        {formatPrice(task.budget_fixed || task.budget_min || 0, currency, task.currency)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {loading ? (
              <p className="text-center text-muted-foreground py-8">{t("dashboard.loading")}</p>
            ) : displayedTasks.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t("tasks.noResults")}</p>
              </div>
            ) : (
              (isClient ? myTasks : displayedTasks).map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{tt(task.id, task.title)}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(task.status || "draft")}`}
                        >
                          {t(`tasks.status.${task.status || "draft"}`)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(task.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-primary font-bold text-sm">
                      {formatPrice(task.budget_fixed || task.budget_min || 0, currency, task.currency)}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* FIND TASKS */}
        {tab === "findTasks" && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <Search className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">{t("dashboard.tasker.findTasks")}</p>

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <select
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="px-3 py-2 border rounded-lg"
                >
                  <option value={5}>5 км</option>
                  <option value={10}>10 км</option>
                  <option value={20}>20 км</option>
                  <option value={50}>50 км</option>
                </select>

                <button
                  onClick={loadNearbyTasks}
                  className="inline-flex items-center justify-center gap-2 border border-border px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-secondary transition-colors"
                >
                  Найти задачи рядом
                </button>

                <Link
                  to="/tasks"
                  className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Все задачи <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {loadingNearby && <p className="text-center text-sm text-muted-foreground mt-3">Ищем задачи рядом...</p>}
            </div>

            {nearbyTasks.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">Задачи рядом</h3>

                {nearbyTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{task.title}</h3>
                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                        )}

                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(task.status || "open")}`}
                          >
                            {t(`tasks.status.${task.status || "open"}`)}
                          </span>
                          <span className="text-xs text-muted-foreground">{Math.round(task.distance_meters)} м</span>
                        </div>
                      </div>

                      <div className="text-primary font-bold text-sm shrink-0">
                        {formatPrice(task.budget_fixed || 0, currency, task.currency)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {searchedNearby && !loadingNearby && nearbyTasks.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-6">В выбранном радиусе задач не найдено</div>
            )}
          </div>
        )}

        {/* MY PROPOSALS */}
        {/* MY PROPOSALS */}
        {tab === "myProposals" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold mb-2">{t("dashboard.tasker.myProposals")}</h2>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">{t("dashboard.loading")}</p>
            ) : myProposals.length === 0 ? (
              <div className="text-center py-12">
                <Briefcase className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t("proposal.none")}</p>
                <Link
                  to="/tasks"
                  className="inline-flex items-center gap-1 mt-3 text-sm text-primary font-medium hover:underline"
                >
                  <Search className="w-4 h-4" /> {t("dashboard.tasker.findTasks")}
                </Link>
              </div>
            ) : (
              myProposals.map((p) => (
                <Link
                  key={p.id}
                  to={`/tasks/${p.task_id}`}
                  className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{tt(p.task_id, p.task?.title || "—")}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(p.status)}`}>
                          {t(`proposal.status.${p.status}`)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-primary font-bold text-sm">{formatPrice(p.price, currency, p.currency)}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* MESSAGES */}
        {tab === "messages" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold mb-2">{t("chat.title") || "Messages"}</h2>
            {chatTasks.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t("chat.empty")}</p>
              </div>
            ) : (
              chatTasks.map((ct) => (
                <Link
                  key={ct.id}
                  to={`/chat/${ct.id}`}
                  className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{ct.title}</h3>
                      {ct.last_message && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{ct.last_message}</p>
                      )}
                      {ct.last_at && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(ct.last_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* ORDERS */}
        {tab === "orders" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold mb-2">{t("orders.title")}</h2>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">{t("dashboard.loading")}</p>
            ) : orders.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingCart className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t("orders.empty")}</p>
              </div>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="p-4 rounded-xl border border-border bg-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          order.status === "paid"
                            ? "bg-emerald-50"
                            : order.status === "failed"
                              ? "bg-red-50"
                              : "bg-amber-50"
                        }`}
                      >
                        {order.status === "paid" ? (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        ) : order.status === "failed" ? (
                          <ShoppingCart className="w-4 h-4 text-red-600" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{order.task?.title || order.id.slice(0, 8)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(order.status)}`}>
                            {t(`orders.status.${order.status}`) || order.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">
                      {formatPrice(order.amount, currency, order.currency)}
                    </span>
                  </div>
                  {order.status === "pending" && order.payment_url && (
                    <a
                      href={order.payment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      {t("payment.pay")} <ArrowRight className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "earnings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t("balance.title")}</h2>

            {/* Balance Card */}
            <div className="p-6 rounded-2xl border border-border bg-gradient-to-br from-card to-muted/30">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("balance.available")}</p>
                  <p className="text-3xl font-extrabold text-primary mt-1">
                    {formatPrice(totalEarnings, currency, escrowData[0]?.currency || "USD")}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-primary" />
                </div>
              </div>

              {pendingEarnings > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {t("balance.pending")}: {formatPrice(pendingEarnings, currency, "USD")}
                  </span>
                </div>
              )}

              <button
                onClick={handleWithdraw}
                disabled={totalEarnings <= 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <ArrowDownToLine className="w-4 h-4" />
                {t("balance.withdraw")} → {t("balance.withdraw.bank")}
              </button>
              <Link
                to="/dashboard/history"
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold border border-border text-foreground hover:bg-secondary transition-colors text-sm"
                data-testid="open-order-history"
              >
                <History className="w-4 h-4" />
                {t("history.openFull")}
              </Link>
            </div>

            {/* Transaction History */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t("balance.history")}</h3>
              {allEscrow.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6 bg-card border border-border rounded-2xl">
                  {t("balance.noTransactions")}
                </p>
              ) : (
                <div className="space-y-2">
                  {allEscrow.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl border border-border bg-card"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            e.status === "released" ? "bg-emerald-50" : "bg-amber-50"
                          }`}
                        >
                          {e.status === "released" ? (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                          ) : (
                            <Clock className="w-4 h-4 text-amber-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm truncate">{tt(`escrow-${i}`, e.task?.title || "—")}</p>
                          <p className="text-xs text-muted-foreground">
                            {t(e.status === "released" ? "balance.transaction.released" : "balance.transaction.held")}
                            {" · "}
                            {new Date(e.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-semibold ms-3 ${
                          e.status === "released" ? "text-primary" : "text-amber-600"
                        }`}
                      >
                        {e.status === "released" ? "+" : ""}
                        {formatPrice(Number(e.net_amount), currency, e.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RATING */}
        {tab === "rating" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t("dashboard.rating")}</h2>
            <div className="p-6 rounded-2xl border border-border bg-card text-center">
              <Star className="w-8 h-8 text-amber-500 fill-amber-500 mx-auto mb-2" />
              <p className="text-3xl font-extrabold">{avgRating || "—"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {reviews.length} {t("dashboard.rating.reviews")}
              </p>
            </div>
            {reviews.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">{t("dashboard.rating.noReviews")}</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div key={r.id} className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${s <= r.rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"}`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.task?.title}</p>
                    {r.comment && <p className="text-sm mt-1">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
