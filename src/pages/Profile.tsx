import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatPrice } from '@/components/CurrencyToggle';
import { supabase } from '@/integrations/supabase/client';
import {
  User, Phone, MapPin, FileText, Save, LogOut, CheckCircle2, Banknote,
  Plus, Search, ClipboardList, DollarSign, Briefcase, Star, ArrowRight
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  task_id: string;
  task?: { title: string } | null;
}

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  task?: { title: string } | null;
}

type Section = 'profile' | 'myTasks' | 'findTasks' | 'myProposals' | 'earnings' | 'rating';

const statusBadge = (status: string) => {
  const colors: Record<string, string> = {
    open: 'bg-emerald-50 text-primary',
    in_progress: 'bg-amber-50 text-amber-600',
    completed: 'bg-secondary text-muted-foreground',
    cancelled: 'bg-red-50 text-red-600',
    draft: 'bg-secondary text-muted-foreground',
    pending: 'bg-amber-50 text-amber-600',
    accepted: 'bg-emerald-50 text-primary',
    rejected: 'bg-red-50 text-red-600',
  };
  return colors[status] || 'bg-secondary text-muted-foreground';
};

const ProfilePage = () => {
  const { t, currency } = useLanguage();
  const { user, profile, roles, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showEmploymentDialog, setShowEmploymentDialog] = useState(false);
  const [hasEmploymentAgreement, setHasEmploymentAgreement] = useState<boolean | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('profile');

  const [myTasks, setMyTasks] = useState<MyTaskRow[]>([]);
  const [myProposals, setMyProposals] = useState<ProposalRow[]>([]);
  const [escrowData, setEscrowData] = useState<EscrowRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const [form, setForm] = useState({
    display_name: '',
    phone: '',
    city: '',
    bio: '',
    payment_method: '',
  });

  const isClient = roles.includes('client');
  const isTasker = roles.includes('tasker');

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name || '',
        phone: profile.phone || '',
        city: profile.city || '',
        bio: profile.bio || '',
        payment_method: (profile as any).payment_method || '',
      });
    }
  }, [profile]);

  useEffect(() => { setSelectedRoles(roles); }, [roles]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('employment_agreements' as any)
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .then(({ data }) => setHasEmploymentAgreement(!!data && data.length > 0));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      setLoadingDashboard(true);
      const [tasksRes, proposalsRes, escrowRes, reviewsRes] = await Promise.all([
        supabase.from('tasks').select('id, title, status, budget_fixed, budget_min, currency, created_at')
          .eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('proposals').select('id, task_id, price, currency, status, created_at, tasks:task_id(title, status)')
          .eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('escrow_transactions').select('net_amount, currency, status, task_id, tasks:task_id(title)')
          .eq('tasker_id', user.id).eq('status', 'released'),
        supabase.from('reviews').select('id, rating, comment, created_at, tasks:task_id(title)')
          .eq('reviewee_id', user.id).order('created_at', { ascending: false }),
      ]);
      setMyTasks((tasksRes.data as MyTaskRow[]) || []);
      setMyProposals((proposalsRes.data as any[])?.map(p => ({
        ...p,
        task: Array.isArray(p.tasks) ? p.tasks[0] : p.tasks,
      })) || []);
      setEscrowData((escrowRes.data as any[])?.map(e => ({
        ...e,
        task: Array.isArray(e.tasks) ? e.tasks[0] : e.tasks,
      })) || []);
      setReviews((reviewsRes.data as any[])?.map(r => ({
        ...r,
        task: Array.isArray(r.tasks) ? r.tasks[0] : r.tasks,
      })) || []);
      setLoadingDashboard(false);
    };
    fetchAll();
  }, [user]);

  const totalEarnings = escrowData.reduce((sum, e) => sum + Number(e.net_amount), 0);
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const handlePaymentSelect = (value: string) => {
    setForm({ ...form, payment_method: value });
    if (value === 'cash_or_check' && hasEmploymentAgreement === false) {
      setShowEmploymentDialog(true);
    }
  };

  const selectRole = (role: string) => { setSelectedRoles([role]); };

  const handleSaveRoles = async () => {
    if (!user) return;
    if (selectedRoles.length === 0) { toast.error(t('profile.roles.needOne')); return; }
    setSavingRoles(true);
    const toAdd = selectedRoles.filter(r => !roles.includes(r));
    const toRemove = roles.filter(r => !selectedRoles.includes(r));
    for (const role of toRemove) {
      await supabase.from('user_roles').delete().eq('user_id', user.id).eq('role', role as any);
    }
    for (const role of toAdd) {
      await supabase.from('user_roles').insert({ user_id: user.id, role: role as any });
    }
    toast.success(t('profile.roles.updated'));
    await refreshProfile();
    setSavingRoles(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const updateData: any = {
      display_name: form.display_name,
      phone: form.phone,
      city: form.city,
      bio: form.bio,
    };
    if (isTasker) updateData.payment_method = form.payment_method || null;
    const { error } = await supabase.from('profiles').update(updateData).eq('user_id', user.id);
    if (error) toast.error(error.message);
    else { toast.success(t('profile.saved')); await refreshProfile(); }
    setSaving(false);
  };

  const handleLogout = async () => { await signOut(); navigate('/'); };

  const rolesChanged = JSON.stringify([...selectedRoles].sort()) !== JSON.stringify([...roles].sort());

  const paymentOptions = [
    { value: 'cash_or_check', label: `${t('profile.payment.cash')} / ${t('profile.payment.check')}`, icon: Banknote },
  ];

  const roleOptions = [
    { value: 'client', label: t('auth.role.client') },
    { value: 'tasker', label: t('auth.role.tasker') },
  ];

  // Build tabs based on role
  const tabs: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: t('nav.profile'), icon: <User className="w-4 h-4" /> },
  ];
  if (isClient) {
    tabs.push({ key: 'myTasks', label: t('dashboard.client.myTasks'), icon: <ClipboardList className="w-4 h-4" /> });
  }
  if (isTasker) {
    tabs.push({ key: 'findTasks', label: t('dashboard.tasker.findTasks'), icon: <Search className="w-4 h-4" /> });
    tabs.push({ key: 'myProposals', label: t('dashboard.tasker.myProposals'), icon: <Briefcase className="w-4 h-4" /> });
    tabs.push({ key: 'earnings', label: t('dashboard.tasker.earnings'), icon: <DollarSign className="w-4 h-4" /> });
    tabs.push({ key: 'rating', label: t('dashboard.rating'), icon: <Star className="w-4 h-4" /> });
  }

  return (
    <div className="min-h-[80vh] py-12">
      <div className="container max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-emerald flex items-center justify-center mx-auto mb-4">
            <User className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">{profile?.display_name || t('nav.profile')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
          {avgRating && (
            <div className="flex items-center justify-center gap-1 mt-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-sm font-semibold">{avgRating}</span>
              <span className="text-xs text-muted-foreground">({reviews.length})</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap rounded-xl bg-muted p-1 mb-6 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`flex items-center gap-1.5 flex-1 min-w-0 py-2 px-2 rounded-lg text-xs font-semibold transition-all justify-center ${
                activeSection === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {tab.icon}
              <span className="truncate hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* === PROFILE === */}
        {activeSection === 'profile' && (
          <div className="space-y-4">
            {/* Quick action cards */}
            {isClient && (
              <div className="p-4 rounded-2xl border border-border bg-card">
                <h2 className="text-sm font-semibold mb-3">{t('dashboard.client.title')}</h2>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/create-task" className="flex items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors">
                    <Plus className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">{t('dashboard.client.createTask')}</span>
                  </Link>
                  <button onClick={() => setActiveSection('myTasks')} className="flex items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-start">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">{t('dashboard.client.myTasks')} ({myTasks.length})</span>
                  </button>
                </div>
              </div>
            )}

            {isTasker && (
              <div className="p-4 rounded-2xl border border-border bg-card">
                <h2 className="text-sm font-semibold mb-3">{t('dashboard.tasker.title')}</h2>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setActiveSection('findTasks')} className="flex items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-start">
                    <Search className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">{t('dashboard.tasker.findTasks')}</span>
                  </button>
                  <button onClick={() => setActiveSection('myProposals')} className="flex items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-start">
                    <Briefcase className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">{t('dashboard.tasker.myProposals')} ({myProposals.length})</span>
                  </button>
                  <button onClick={() => setActiveSection('earnings')} className="flex items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-start">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">{t('dashboard.tasker.earnings')}</span>
                  </button>
                  <button onClick={() => setActiveSection('rating')} className="flex items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-start">
                    <Star className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">{t('dashboard.rating')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Roles */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('profile.roles')}</label>
              <div className="flex gap-2">
                {roleOptions.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => selectRole(r.value)}
                    className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                      selectedRoles.includes(r.value)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {selectedRoles.includes(r.value) && <CheckCircle2 className="w-3 h-3 inline me-1" />}
                    {r.label}
                  </button>
                ))}
              </div>
              {rolesChanged && (
                <button onClick={handleSaveRoles} disabled={savingRoles}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
                  {savingRoles ? '...' : t('profile.save')}
                </button>
              )}
            </div>

            {/* Form fields */}
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.name')}</label>
              <div className="relative">
                <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('profile.phone')}</label>
              <div className="relative">
                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('profile.city')}</label>
              <div className="relative">
                <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('profile.about')}</label>
              <div className="relative">
                <FileText className="absolute start-3 top-3 w-4 h-4 text-muted-foreground" />
                <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none" />
              </div>
            </div>

            {isTasker && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('profile.payment.title')}</label>
                <p className="text-xs text-muted-foreground mb-2">{t('profile.payment.subtitle')}</p>
                <div className="flex gap-2">
                  {paymentOptions.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => handlePaymentSelect(opt.value)}
                      className={`flex-1 py-3 px-3 rounded-xl border text-xs font-medium transition-all flex flex-col items-center gap-1.5 ${
                        form.payment_method === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                      }`}>
                      <opt.icon className="w-5 h-5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleSave} disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? '...' : t('profile.save')}
            </button>

            <button onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium border border-destructive text-destructive hover:bg-destructive/10 transition-colors">
              <LogOut className="w-4 h-4" />
              {t('nav.logout')}
            </button>
          </div>
        )}

        {/* === MY TASKS === */}
        {activeSection === 'myTasks' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">{t('dashboard.client.myTasks')}</h2>
              <Link to="/create-task" className="flex items-center gap-1 text-sm text-primary font-medium hover:underline">
                <Plus className="w-4 h-4" /> {t('dashboard.client.createTask')}
              </Link>
            </div>
            {loadingDashboard ? (
              <p className="text-center text-muted-foreground py-8">{t('dashboard.loading')}</p>
            ) : myTasks.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('tasks.noResults')}</p>
              </div>
            ) : (
              myTasks.map((task) => (
                <Link key={task.id} to={`/tasks/${task.id}`}
                  className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{task.title}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(task.status || 'draft')}`}>
                          {t(`tasks.status.${task.status || 'draft'}`)}
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(task.created_at).toLocaleDateString()}</span>
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

        {/* === FIND TASKS === */}
        {activeSection === 'findTasks' && (
          <div className="text-center py-12">
            <Search className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">{t('dashboard.tasker.findTasks')}</p>
            <Link to="/tasks"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
              {t('dashboard.tasker.findTasks')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* === MY PROPOSALS === */}
        {activeSection === 'myProposals' && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold mb-2">{t('dashboard.tasker.myProposals')}</h2>
            {loadingDashboard ? (
              <p className="text-center text-muted-foreground py-8">{t('dashboard.loading')}</p>
            ) : myProposals.length === 0 ? (
              <div className="text-center py-12">
                <Briefcase className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('proposal.none')}</p>
                <Link to="/tasks" className="inline-flex items-center gap-1 mt-3 text-sm text-primary font-medium hover:underline">
                  <Search className="w-4 h-4" /> {t('dashboard.tasker.findTasks')}
                </Link>
              </div>
            ) : (
              myProposals.map((proposal) => (
                <Link key={proposal.id} to={`/tasks/${proposal.task_id}`}
                  className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{proposal.task?.title || '—'}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(proposal.status)}`}>
                          {t(`proposal.status.${proposal.status}`)}
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(proposal.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-primary font-bold text-sm">
                      {formatPrice(proposal.price, currency, proposal.currency)}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* === EARNINGS === */}
        {activeSection === 'earnings' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t('dashboard.tasker.earnings')}</h2>
            <div className="p-6 rounded-2xl border border-border bg-card text-center">
              <DollarSign className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-3xl font-extrabold text-primary">
                {formatPrice(totalEarnings, currency, escrowData[0]?.currency || 'USD')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{t('dashboard.earnings.total')}</p>
            </div>
            {escrowData.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">{t('dashboard.earnings.noData')}</p>
            ) : (
              <div className="space-y-2">
                {escrowData.map((e, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
                    <span className="text-sm truncate flex-1">{e.task?.title || '—'}</span>
                    <span className="text-sm font-semibold text-primary ms-3">
                      {formatPrice(Number(e.net_amount), currency, e.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === RATING === */}
        {activeSection === 'rating' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t('dashboard.rating')}</h2>
            <div className="p-6 rounded-2xl border border-border bg-card text-center">
              <Star className="w-8 h-8 text-amber-500 fill-amber-500 mx-auto mb-2" />
              <p className="text-3xl font-extrabold">{avgRating || '—'}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {reviews.length} {t('dashboard.rating.reviews')}
              </p>
            </div>
            {reviews.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">{t('dashboard.rating.noReviews')}</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div key={r.id} className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((s) => (
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

        <Dialog open={showEmploymentDialog} onOpenChange={setShowEmploymentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('employment.dialog.title')}</DialogTitle>
              <DialogDescription>{t('employment.dialog.description')}</DialogDescription>
            </DialogHeader>
            <Button onClick={() => { setShowEmploymentDialog(false); navigate('/employment-agreement'); }} className="w-full">
              {t('employment.dialog.cta')}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ProfilePage;
