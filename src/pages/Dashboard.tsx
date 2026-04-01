import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { supabase } from '@/integrations/supabase/client';
import {
  User, Search, ClipboardList, DollarSign, Briefcase, Star, Plus, ArrowRight
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface ProposalRow {
  id: string; task_id: string; price: number; currency: string | null;
  status: string; created_at: string;
  task?: { title: string; status: string | null } | null;
}
interface MyTaskRow {
  id: string; title: string; status: string | null;
  budget_fixed: number | null; budget_min: number | null;
  currency: string | null; created_at: string;
}
interface EscrowRow {
  net_amount: number; currency: string; status: string;
  task?: { title: string } | null;
}
interface ReviewRow {
  id: string; rating: number; comment: string | null;
  created_at: string; task?: { title: string } | null;
}

type Tab = 'myTasks' | 'findTasks' | 'myProposals' | 'earnings' | 'rating';

const statusBadge = (status: string) => {
  const c: Record<string, string> = {
    open: 'bg-emerald-50 text-primary', in_progress: 'bg-amber-50 text-amber-600',
    completed: 'bg-secondary text-muted-foreground', cancelled: 'bg-red-50 text-red-600',
    draft: 'bg-secondary text-muted-foreground', pending: 'bg-amber-50 text-amber-600',
    accepted: 'bg-emerald-50 text-primary', rejected: 'bg-red-50 text-red-600',
  };
  return c[status] || 'bg-secondary text-muted-foreground';
};

const DashboardPage = () => {
  const { t, currency } = useLanguage();
  const formatPrice = useFormatPrice();
  const { user, profile, roles } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('myTasks');
  const [myTasks, setMyTasks] = useState<MyTaskRow[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<MyTaskRow[]>([]);
  const [myProposals, setMyProposals] = useState<ProposalRow[]>([]);
  const [escrowData, setEscrowData] = useState<EscrowRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isClient = roles.includes('client');
  const isTasker = roles.includes('tasker');

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      setLoading(true);
      const [tasksRes, proposalsRes, escrowRes, reviewsRes, assignedRes] = await Promise.all([
        supabase.from('tasks').select('id, title, status, budget_fixed, budget_min, currency, created_at')
          .eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('proposals').select('id, task_id, price, currency, status, created_at, tasks:task_id(title, status)')
          .eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('escrow_transactions').select('net_amount, currency, status, tasks:task_id(title)')
          .eq('tasker_id', user.id).eq('status', 'released'),
        supabase.from('reviews').select('id, rating, comment, created_at, tasks:task_id(title)')
          .eq('reviewee_id', user.id).order('created_at', { ascending: false }),
        supabase.from('tasks').select('id, title, status, budget_fixed, budget_min, currency, created_at')
          .eq('assigned_to', user.id).order('created_at', { ascending: false }),
      ]);
      setMyTasks((tasksRes.data as MyTaskRow[]) || []);
      setAssignedTasks((assignedRes.data as MyTaskRow[]) || []);
      setMyProposals((proposalsRes.data as any[])?.map(p => ({ ...p, task: Array.isArray(p.tasks) ? p.tasks[0] : p.tasks })) || []);
      setEscrowData((escrowRes.data as any[])?.map(e => ({ ...e, task: Array.isArray(e.tasks) ? e.tasks[0] : e.tasks })) || []);
      setReviews((reviewsRes.data as any[])?.map(r => ({ ...r, task: Array.isArray(r.tasks) ? r.tasks[0] : r.tasks })) || []);
      setLoading(false);
    };
    fetchAll();
  }, [user]);

  const totalEarnings = escrowData.reduce((sum, e) => sum + Number(e.net_amount), 0);
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : null;

  // All users see myTasks; taskers also get extra tabs
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'myTasks', label: t('dashboard.client.myTasks'), icon: <ClipboardList className="w-4 h-4" /> },
  ];
  if (isTasker) {
    tabs.push({ key: 'findTasks', label: t('dashboard.tasker.findTasks'), icon: <Search className="w-4 h-4" /> });
    tabs.push({ key: 'myProposals', label: t('dashboard.tasker.myProposals'), icon: <Briefcase className="w-4 h-4" /> });
    tabs.push({ key: 'earnings', label: t('dashboard.tasker.earnings'), icon: <DollarSign className="w-4 h-4" /> });
    tabs.push({ key: 'rating', label: t('dashboard.rating'), icon: <Star className="w-4 h-4" /> });
  }

  // Decide which tasks to show: client sees created tasks, tasker sees assigned tasks
  const displayedTasks = isTasker && !isClient ? assignedTasks : myTasks;

  return (
    <div className="min-h-[80vh] py-8">
      <div className="container max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 border-2 border-border" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-emerald flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-primary-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{profile?.display_name || t('nav.dashboard')}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            {avgRating && (
              <div className="flex items-center gap-1 mt-0.5">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span className="text-sm font-semibold">{avgRating}</span>
                <span className="text-xs text-muted-foreground">({reviews.length})</span>
              </div>
            )}
          </div>
          <Link to="/profile" className="text-xs text-primary font-medium hover:underline shrink-0">
            {t('nav.profile')} →
          </Link>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-xl font-bold text-primary">{displayedTasks.length}</p>
            <p className="text-xs text-muted-foreground">{t('dashboard.client.myTasks')}</p>
          </div>
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-xl font-bold text-primary">{myProposals.length}</p>
            <p className="text-xs text-muted-foreground">{t('dashboard.tasker.myProposals')}</p>
          </div>
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-xl font-bold text-primary">{avgRating || '—'}</p>
            <p className="text-xs text-muted-foreground">{t('dashboard.rating')}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap rounded-xl bg-muted p-1 mb-6 gap-1">
          {tabs.map((tb) => (
            <button key={tb.key} onClick={() => {
              if (tb.key === 'findTasks') { navigate('/tasks'); return; }
              setTab(tb.key);
            }}
              className={`flex items-center gap-1.5 flex-1 min-w-0 py-2 px-2 rounded-lg text-xs font-semibold transition-all justify-center ${
                tab === tb.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}>
              {tb.icon}
              <span className="truncate hidden sm:inline">{tb.label}</span>
            </button>
          ))}
        </div>

        {/* MY TASKS */}
        {tab === 'myTasks' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">{t('dashboard.client.myTasks')}</h2>
              {isClient && (
                <Link to="/create-task" className="flex items-center gap-1 text-sm text-primary font-medium hover:underline">
                  <Plus className="w-4 h-4" /> {t('dashboard.client.createTask')}
                </Link>
              )}
            </div>

            {/* For users who are both client+tasker, show assigned tasks too */}
            {isClient && isTasker && assignedTasks.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('dashboard.tasker.assignedTasks')}</h3>
                {assignedTasks.map((task) => (
                  <Link key={task.id} to={`/tasks/${task.id}`} className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all mb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{task.title}</h3>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(task.status || 'draft')}`}>{t(`tasks.status.${task.status || 'draft'}`)}</span>
                      </div>
                      <div className="text-primary font-bold text-sm">{formatPrice(task.budget_fixed || task.budget_min || 0, currency, task.currency)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {loading ? <p className="text-center text-muted-foreground py-8">{t('dashboard.loading')}</p>
            : displayedTasks.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('tasks.noResults')}</p>
              </div>
            ) : (isClient ? myTasks : displayedTasks).map((task) => (
              <Link key={task.id} to={`/tasks/${task.id}`} className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{task.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(task.status || 'draft')}`}>{t(`tasks.status.${task.status || 'draft'}`)}</span>
                      <span className="text-xs text-muted-foreground">{new Date(task.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="text-primary font-bold text-sm">{formatPrice(task.budget_fixed || task.budget_min || 0, currency, task.currency)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* FIND TASKS */}
        {tab === 'findTasks' && (
          <div className="text-center py-12">
            <Search className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">{t('dashboard.tasker.findTasks')}</p>
            <Link to="/tasks" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
              {t('dashboard.tasker.findTasks')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* MY PROPOSALS */}
        {tab === 'myProposals' && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold mb-2">{t('dashboard.tasker.myProposals')}</h2>
            {loading ? <p className="text-center text-muted-foreground py-8">{t('dashboard.loading')}</p>
            : myProposals.length === 0 ? (
              <div className="text-center py-12">
                <Briefcase className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('proposal.none')}</p>
                <Link to="/tasks" className="inline-flex items-center gap-1 mt-3 text-sm text-primary font-medium hover:underline">
                  <Search className="w-4 h-4" /> {t('dashboard.tasker.findTasks')}
                </Link>
              </div>
            ) : myProposals.map((p) => (
              <Link key={p.id} to={`/tasks/${p.task_id}`} className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{p.task?.title || '—'}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(p.status)}`}>{t(`proposal.status.${p.status}`)}</span>
                      <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="text-primary font-bold text-sm">{formatPrice(p.price, currency, p.currency)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* EARNINGS */}
        {tab === 'earnings' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t('dashboard.tasker.earnings')}</h2>
            <div className="p-6 rounded-2xl border border-border bg-card text-center">
              <DollarSign className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-3xl font-extrabold text-primary">{formatPrice(totalEarnings, currency, escrowData[0]?.currency || 'USD')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('dashboard.earnings.total')}</p>
            </div>
            {escrowData.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">{t('dashboard.earnings.noData')}</p>
            ) : (
              <div className="space-y-2">
                {escrowData.map((e, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
                    <span className="text-sm truncate flex-1">{e.task?.title || '—'}</span>
                    <span className="text-sm font-semibold text-primary ms-3">{formatPrice(Number(e.net_amount), currency, e.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RATING */}
        {tab === 'rating' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t('dashboard.rating')}</h2>
            <div className="p-6 rounded-2xl border border-border bg-card text-center">
              <Star className="w-8 h-8 text-amber-500 fill-amber-500 mx-auto mb-2" />
              <p className="text-3xl font-extrabold">{avgRating || '—'}</p>
              <p className="text-sm text-muted-foreground mt-1">{reviews.length} {t('dashboard.rating.reviews')}</p>
            </div>
            {reviews.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">{t('dashboard.rating.noReviews')}</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div key={r.id} className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30'}`} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
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
