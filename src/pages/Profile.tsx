import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { User, Phone, MapPin, FileText, Save, LogOut, CheckCircle2, Banknote, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const ProfilePage = () => {
  const { t } = useLanguage();
  const { user, profile, roles, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

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
  const isTasker = roles.includes('tasker');

  const paymentOptions = [
    { value: 'cash', label: t('profile.payment.cash'), icon: Banknote },
    { value: 'check', label: t('profile.payment.check'), icon: Receipt },
  ];

  const roleOptions: { value: string; label: string }[] = [
    { value: 'client', label: t('auth.role.client') },
    { value: 'tasker', label: t('auth.role.tasker') },
  ];

  return (
    <div className="min-h-[80vh] py-12">
      <div className="container max-w-lg mx-auto px-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-emerald flex items-center justify-center mx-auto mb-4">
            <User className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">{t('nav.profile')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
        </div>

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

          {/* Payment method for taskers */}
          {isTasker && (
            <div>
              <label className="block text-sm font-medium mb-2">{t('profile.payment.title')}</label>
              <div className="flex gap-2">
                {paymentOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, payment_method: opt.value })}
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
      </div>
    </div>
  );
};

export default ProfilePage;
