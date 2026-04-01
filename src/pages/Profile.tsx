import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { User, Phone, MapPin, FileText, Save, LogOut, CheckCircle2, Banknote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ProfilePage = () => {
  const { t } = useLanguage();
  const { user, profile, roles, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showEmploymentDialog, setShowEmploymentDialog] = useState(false);
  const [hasEmploymentAgreement, setHasEmploymentAgreement] = useState<boolean | null>(null);

  const [form, setForm] = useState({
    display_name: '', phone: '', city: '', bio: '', payment_method: '',
  });

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
    supabase.from('employment_agreements' as any).select('id').eq('user_id', user.id).limit(1)
      .then(({ data }) => setHasEmploymentAgreement(!!data && data.length > 0));
  }, [user]);

  const handlePaymentSelect = (value: string) => {
    setForm({ ...form, payment_method: value });
    if (value === 'cash_or_check' && hasEmploymentAgreement === false) setShowEmploymentDialog(true);
  };

  const selectRole = (role: string) => { setSelectedRoles([role]); };

  const handleSaveRoles = async () => {
    if (!user) return;
    if (selectedRoles.length === 0) { toast.error(t('profile.roles.needOne')); return; }
    setSavingRoles(true);
    const toAdd = selectedRoles.filter(r => !roles.includes(r));
    const toRemove = roles.filter(r => !selectedRoles.includes(r));
    for (const role of toRemove) await supabase.from('user_roles').delete().eq('user_id', user.id).eq('role', role as any);
    for (const role of toAdd) await supabase.from('user_roles').insert({ user_id: user.id, role: role as any });
    toast.success(t('profile.roles.updated'));
    await refreshProfile();
    setSavingRoles(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const updateData: any = { display_name: form.display_name, phone: form.phone, city: form.city, bio: form.bio };
    if (isTasker) updateData.payment_method = form.payment_method || null;
    const { error } = await supabase.from('profiles').update(updateData).eq('user_id', user.id);
    if (error) toast.error(error.message);
    else { toast.success(t('profile.saved')); await refreshProfile(); }
    setSaving(false);
  };

  const handleLogout = async () => { await signOut(); navigate('/'); };
  const rolesChanged = JSON.stringify([...selectedRoles].sort()) !== JSON.stringify([...roles].sort());

  const roleOptions = [
    { value: 'client', label: t('auth.role.client') },
    { value: 'tasker', label: t('auth.role.tasker') },
  ];
  const paymentOptions = [
    { value: 'cash_or_check', label: `${t('profile.payment.cash')} / ${t('profile.payment.check')}`, icon: Banknote },
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

        <div className="space-y-4">
          {/* Roles */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('profile.roles')}</label>
            <div className="flex gap-2">
              {roleOptions.map((r) => (
                <button key={r.value} type="button" onClick={() => selectRole(r.value)}
                  className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                    selectedRoles.includes(r.value) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                  }`}>
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
