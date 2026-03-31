import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatPrice } from '@/components/CurrencyToggle';
import { supabase } from '@/integrations/supabase/client';
import { User, Phone, MapPin, FileText, Save, LogOut, CheckCircle2, Banknote, Plus, Search, ClipboardList, DollarSign, Briefcase, BarChart3 } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  proposals_count?: number;
}

const ProfilePage = () => {
  const { t, currency } = useLanguage();
  const { user, profile, roles, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showEmploymentDialog, setShowEmploymentDialog] = useState(false);
  const [hasEmploymentAgreement, setHasEmploymentAgreement] = useState<boolean | null>(null);
  const [activeSection, setActiveSection] = useState<'profile' | 'myTasks' | 'myProposals'>('profile');

  // Dashboard data
  const [myTasks, setMyTasks] = useState<MyTaskRow[]>([]);
  const [myProposals, setMyProposals] = useState<ProposalRow[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const [form, setForm] = useState({
    display_name: '',
    phone: '',
    city: '',
    bio: '',
    payment_method: '',
  });

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

  useEffect(() => {
    setSelectedRoles(roles);
  }, [roles]);

  useEffect(() => {
    if (!user) return;
    const checkAgreement = async () => {
      const { data } = await supabase
        .from('employment_agreements' as any)
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      setHasEmploymentAgreement(!!data && data.length > 0);
    };
    checkAgreement();
  }, [user]);

  // Fetch dashboard data
  useEffect(() => {
    if (!user) return;
    const fetchDashboard = async () => {
      setLoadingDashboard(true);
      const [tasksRes, proposalsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, status, budget_fixed, budget_min, currency, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('proposals')
          .select('id, task_id, price, currency, status, created_at, tasks:task_id(title, status)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);
      setMyTasks((tasksRes.data as MyTaskRow[]) || []);
      setMyProposals((proposalsRes.data as any[])?.map(p => ({
        ...p,
        task: Array.isArray(p.tasks) ? p.tasks[0] : p.tasks,
      })) || []);
      setLoadingDashboard(false);
    };
    fetchDashboard();
  }, [user]);

  const handlePaymentSelect = (value: string) => {
    setForm({ ...form, payment_method: value });
    if (value === 'cash_or_check' && hasEmploymentAgreement === false) {
      setShowEmploymentDialog(true);
    }
  };

  const selectRole = (role: string) => {
    setSelectedRoles([role]);
  };

  const handleSaveRoles = async () => {
    if (!user) return;
    if (selectedRoles.length === 0) {
      toast.error(t('profile.roles.needOne'));
      return;
    }
    setSavingRoles(true);
    const toAdd = selectedRoles.filter(r => !roles.includes(r));
    const toRemove = roles.filter(r => !selectedRoles.includes(r));
    for (const role of toRemove) {
      await supabase.from('user_roles').delete().eq('user_id', user.id).eq('role', role as 'client' | 'tasker' | 'admin');
    }
    for (const role of toAdd) {
      await supabase.from('user_roles').insert({ user_id: user.id, role: role as 'client' | 'tasker' });
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
    if (isTasker) {
      updateData.payment_method = form.payment_method || null;
    }
    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('user_id', user.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('profile.saved'));
      await refreshProfile();
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const rolesChanged = JSON.stringify([...selectedRoles].sort()) !== JSON.stringify([...roles].sort());
  const isClient = roles.includes('client');
  const isTasker = roles.includes('tasker');

  const paymentOptions = [
    { value: 'cash_or_check', label: `${t('profile.payment.cash')} / ${t('profile.payment.check')}`, icon: Banknote },
  ];

  const roleOptions: { value: string; label: string }[] = [
    { value: 'client', label: t('auth.role.client') },
    { value: 'tasker', label: t('auth.role.tasker') },
  ];

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

  const sectionTabs = [
    { key: 'profile' as const, label: t('nav.profile') },
    ...(isClient ? [{ key: 'myTasks' as const, label: t('dashboard.client.myTasks') }] : []),
    ...(isTasker ? [{ key: 'myProposals' as const, label: t('dashboard.tasker.myProposals') }] : []),
  ];

  return (
    <div className="min-h-[80vh] py-12">
      <div className="container max-w-lg mx-auto px-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-emerald flex items-center justify-center mx-auto mb-4">
            <User className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">{profile?.display_name || t('nav.profile')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
        </div>

        {/* Section tabs */}
        {sectionTabs.length > 1 && (
          <div className="flex rounded-xl bg-muted p-1 mb-6">
            {sectionTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveSection(tab.key)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeSection === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Quick actions */}
        {activeSection === 'profile' && (
          <>
            {isClient && (
              <div className="mb-6 p-4 rounded-2xl border border-border bg-card">
                <h2 className="text-sm font-semibold mb-3 text-foreground">{t('dashboard.client.title')}</h2>
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
              <div className="mb-6 p-4 rounded-2xl border border-border bg-card">
                <h2 className="text-sm font-semibold mb-3 text-foreground">{t('dashboard.tasker.title')}</h2>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/tasks" className="flex items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors">
                    <Search className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">{t('dashboard.tasker.findTasks')}</span>
                  </Link>
                  <button onClick={() => setActiveSection('myProposals')} className="flex items-center gap-2 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-start">
                    <Briefcase className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">{t('dashboard.tasker.myProposals')} ({myProposals.length})</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* MY TASKS section */}
        {activeSection === 'myTasks' && (
          <div className="space-y-3 mb-6">
            {loadingDashboard ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : myTasks.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('tasks.noResults')}</p>
                <Link to="/create-task" className="inline-flex items-center gap-1 mt-3 text-sm text-primary font-medium hover:underline">
                  <Plus className="w-4 h-4" /> {t('dashboard.client.createTask')}
                </Link>
              </div>
            ) : (
              myTasks.map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{task.title}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(task.status || 'draft')}`}>
                          {t(`tasks.status.${task.status || 'draft'}`)}
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

        {/* MY PROPOSALS section */}
        {activeSection === 'myProposals' && (
          <div className="space-y-3 mb-6">
            {loadingDashboard ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
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
                <Link
                  key={proposal.id}
                  to={`/tasks/${proposal.task_id}`}
                  className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{proposal.task?.title || '—'}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(proposal.status)}`}>
                          {t(`proposal.status.${proposal.status}`)}
                        </span>
                        {proposal.task?.status && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(proposal.task.status)}`}>
                            {t(`tasks.status.${proposal.task.status}`)}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(proposal.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-primary font-bold text-sm">
                      {formatPrice(proposal.price, currency)}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* Profile form */}
        {activeSection === 'profile' && (
          <div className="space-y-4">
            {/* Roles section */}
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
                        ? 'border-primary bg-emerald-50 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {selectedRoles.includes(r.value) && <CheckCircle2 className="w-3 h-3 inline me-1" />}
                    {r.label}
                  </button>
                ))}
              </div>
              {rolesChanged && (
                <button
                  onClick={handleSaveRoles}
                  disabled={savingRoles}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {savingRoles ? '...' : t('profile.save')}
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.name')}</label>
              <div className="relative">
                <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">{t('profile.phone')}</label>
              <div className="relative">
                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">{t('profile.city')}</label>
              <div className="relative">
                <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">{t('profile.about')}</label>
              <div className="relative">
                <FileText className="absolute start-3 top-3 w-4 h-4 text-muted-foreground" />
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  rows={4}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none"
                />
              </div>
            </div>

            {isTasker && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('profile.payment.title')}</label>
                <p className="text-xs text-muted-foreground mb-2">{t('profile.payment.subtitle')}</p>
                <div className="flex gap-2">
                  {paymentOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handlePaymentSelect(opt.value)}
                      className={`flex-1 py-3 px-3 rounded-xl border text-xs font-medium transition-all flex flex-col items-center gap-1.5 ${
                        form.payment_method === opt.value
                          ? 'border-primary bg-emerald-50 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      <opt.icon className="w-5 h-5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? '...' : t('profile.save')}
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t('nav.logout')}
            </button>
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
