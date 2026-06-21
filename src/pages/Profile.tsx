import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { supabase } from '@/integrations/supabase/client';
import { User, Phone, MapPin, FileText, Save, LogOut, CheckCircle2, Banknote, Camera, LayoutDashboard, Trash2, Briefcase, ShoppingBag, Send } from 'lucide-react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { addSelfRole, removeSelfRole, type SelfRole } from '@/lib/api/protectedWrites';
import { friendlyErrorMessage } from '@/lib/api/friendlyError';
import { normalizePhone } from '@/lib/phone';
import TaskerPayoutSetup from '@/components/TaskerPayoutSetup';

const ProfilePage = () => {
  const { t } = useLanguage();
  const { user, profile, roles, signOut, refreshProfile } = useAuth();
  const { activeRole, setActiveRole, hasBothRoles, isClient, isTasker } = useActiveRole();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const onboarding = searchParams.get('onboarding') === '1';

  const [saving, setSaving] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showEmploymentDialog, setShowEmploymentDialog] = useState(false);
  const [hasEmploymentAgreement, setHasEmploymentAgreement] = useState<boolean | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPopoverOpen, setAvatarPopoverOpen] = useState(false);

  // Telegram linking
  const [tgGenerating, setTgGenerating] = useState(false);
  const [tgUnlinking, setTgUnlinking] = useState(false);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgDeepLink, setTgDeepLink] = useState<string | null>(null);
  const telegramLinked = !!(profile as any)?.telegram_chat_id && !!(profile as any)?.telegram_opt_in;

  const [form, setForm] = useState({
    display_name: '', phone: '', city: '', bio: '', payment_method: '',
    whatsapp_opt_in: false, whatsapp_phone: '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name || '',
        phone: profile.phone || '',
        city: profile.city || '',
        bio: profile.bio || '',
        payment_method: (profile as any).payment_method || '',
        whatsapp_opt_in: !!(profile as any).whatsapp_opt_in,
        whatsapp_phone: (profile as any).whatsapp_phone || '',
      });
    }
  }, [profile]);

  // Sync local selection with saved roles whenever they change (initial load + after refresh)
  useEffect(() => {
    const saved = roles.filter((r) => r === 'client' || r === 'executor');
    setSelectedRoles(saved);
  }, [roles]);

  useEffect(() => {
    if (!user) return;
    supabase.from('employment_agreements' as any).select('id').eq('user_id', user.id).limit(1)
      .then(({ data }) => setHasEmploymentAgreement(!!data && data.length > 0));
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = `${publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('user_id', user.id);
      if (updateError) throw updateError;
      await refreshProfile();
      toast.success(t('profile.avatar.uploaded'));
    } catch (err: any) {
      toast.error(friendlyErrorMessage(err, 'Failed to upload avatar'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarDelete = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const { data: files } = await supabase.storage.from('avatars').list(user.id);
      if (files && files.length > 0) {
        await supabase.storage.from('avatars').remove(files.map(f => `${user.id}/${f.name}`));
      }
      await supabase.from('profiles').update({ avatar_url: null }).eq('user_id', user.id);
      await refreshProfile();
      toast.success(t('profile.avatar.deleted'));
    } catch (err: any) {
      toast.error(friendlyErrorMessage(err, 'Failed to remove avatar'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePaymentSelect = (value: string) => {
    setForm({ ...form, payment_method: value });
    if (value === 'cash_or_check' && hasEmploymentAgreement === false) setShowEmploymentDialog(true);
  };

  const toggleRole = (role: string) => {
    // Single-select: only one of client/executor at a time
    setSelectedRoles((prev) => {
      const preserved = prev.filter((r) => r !== 'client' && r !== 'executor');
      return [...preserved, role];
    });
  };

  const handleSaveRoles = async () => {
    if (!user) return;
    // Only one ordinary role at a time: client OR executor (never both).
    const ordinary = selectedRoles.filter((r) => r === 'client' || r === 'executor');
    if (ordinary.length === 0) { toast.error(t('profile.roles.needOne')); return; }
    if (ordinary.length > 1) { toast.error(t('profile.roles.needOne')); return; }
    const chosen = ordinary[0] as 'client' | 'executor';
    setSavingRoles(true);
    try {
      const toRemove = roles.filter(
        (r) => (r === 'client' || r === 'executor') && r !== chosen,
      );
      const toAdd = roles.includes(chosen) ? [] : [chosen];
      for (const role of toRemove) {
        const { error } = await removeSelfRole(user.id, role as SelfRole);
        if (error) throw error;
      }
      for (const role of toAdd) {
        const { error } = await addSelfRole(user.id, role as SelfRole);
        if (error) throw error;
      }
      // Persist as the active role too so UI and DB stay aligned.
      await supabase
        .from('profiles')
        .update({ active_role: chosen as never })
        .eq('user_id', user.id);
      await refreshProfile();
      toast.success(t('profile.roles.updated'));
    } catch (err: any) {
      toast.error(friendlyErrorMessage(err, 'Failed to update roles'));
    } finally {
      setSavingRoles(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    // Normalize phone numbers to E.164 (IL or CY). Reject invalid input.
    let normalizedPhone: string | null = form.phone?.trim() ? null : null;
    if (form.phone?.trim()) {
      const res = normalizePhone(form.phone);
      if (!res.ok) {
        toast.error(res.error || 'Invalid phone number');
        setSaving(false);
        return;
      }
      normalizedPhone = res.e164!;
    }
    let normalizedWa: string | null = null;
    if (form.whatsapp_phone?.trim()) {
      const res = normalizePhone(form.whatsapp_phone);
      if (!res.ok) {
        toast.error(res.error || 'Invalid WhatsApp phone');
        setSaving(false);
        return;
      }
      normalizedWa = res.e164!;
    }

    // Do not overwrite an existing verified phone automatically.
    const isVerified = !!(profile as any)?.is_verified;
    const existingPhone = profile?.phone || null;
    const phoneToSave =
      isVerified && existingPhone && normalizedPhone && normalizedPhone !== existingPhone
        ? existingPhone
        : normalizedPhone;

    // Phone-ownership pre-check: a phone/whatsapp_phone may not belong to another user.
    const orFilters: string[] = [];
    if (phoneToSave) orFilters.push(`phone.eq.${phoneToSave}`);
    if (normalizedWa) orFilters.push(`whatsapp_phone.eq.${normalizedWa}`);
    if (orFilters.length) {
      const { data: clash } = await supabase
        .from('profiles')
        .select('user_id')
        .or(orFilters.join(','))
        .neq('user_id', user.id)
        .limit(1);
      if (clash && clash.length > 0) {
        toast.error(t('profile.phone.taken'));
        setSaving(false);
        return;
      }
    }

    const updateData: any = { display_name: form.display_name, phone: phoneToSave, city: form.city, bio: form.bio };
    if (isTasker) updateData.payment_method = form.payment_method || null;
    // WhatsApp notification preferences (opt-in is never enabled by default)
    updateData.whatsapp_opt_in = form.whatsapp_opt_in;
    updateData.whatsapp_phone = normalizedWa;
    if (form.whatsapp_opt_in && !(profile as any)?.whatsapp_opt_in) {
      updateData.whatsapp_opt_in_at = new Date().toISOString();
      updateData.whatsapp_opt_out_at = null;
    } else if (!form.whatsapp_opt_in && (profile as any)?.whatsapp_opt_in) {
      updateData.whatsapp_opt_out_at = new Date().toISOString();
    }
    const { error } = await supabase.from('profiles').update(updateData).eq('user_id', user.id);
    if (error) {
      // 23505 = unique_violation. Race fallback for the DB unique partial index.
      if ((error as any)?.code === '23505') toast.error(t('profile.phone.taken'));
      else toast.error(friendlyErrorMessage(error, 'Failed to save profile'));
    }
    else { toast.success(t('profile.saved')); await refreshProfile(); }
    setSaving(false);
  };

  const handleLogout = async () => { await signOut(); navigate('/'); };

  const handleGenerateTelegramCode = async () => {
    setTgGenerating(true);
    setTgCode(null);
    setTgDeepLink(null);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-link-code', { body: {} });
      if (error) {
        const status = (error as any)?.context?.status;
        toast.error(status === 429 ? t('telegram.error.rate_limited') : t('telegram.error.generic'));
        return;
      }
      const code = (data as any)?.code as string | undefined;
      const link = (data as any)?.deep_link as string | null | undefined;
      if (!code) {
        toast.error(t('telegram.error.generic'));
        return;
      }
      setTgCode(code);
      setTgDeepLink(link ?? null);
    } catch (e: any) {
      toast.error(friendlyErrorMessage(e, 'Could not generate code'));
    } finally {
      setTgGenerating(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!user) return;
    if (!confirm(t('telegram.unlink.confirm'))) return;
    setTgUnlinking(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          telegram_opt_in: false,
          telegram_opt_out_at: new Date().toISOString(),
          telegram_chat_id: null,
        } as any)
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      setTgCode(null);
      setTgDeepLink(null);
      toast.success(t('telegram.unlinked'));
    } catch (e: any) {
      toast.error(friendlyErrorMessage(e, 'Failed to unlink Telegram'));
    } finally {
      setTgUnlinking(false);
    }
  };

  const rolesChanged = JSON.stringify([...selectedRoles].sort()) !== JSON.stringify([...roles].sort());

  const roleOptions = [
    { value: 'client', label: t('auth.role.client') },
    { value: 'executor', label: t('auth.role.tasker') },
  ];
  const paymentOptions = [
    { value: 'cash_or_check', label: `${t('profile.payment.cash')} / ${t('profile.payment.check')}`, icon: Banknote },
  ];

  return (
    <div className="min-h-[80vh] py-12">
      <div className="container max-w-lg mx-auto px-4">
        {onboarding && (
          <div className="mb-6 p-4 rounded-2xl border border-primary/30 bg-primary/5">
            <p className="text-sm font-semibold text-primary mb-1">
              Завершите настройку профиля
            </p>
            <p className="text-xs text-muted-foreground">
              Укажите номер телефона и подтвердите согласие на уведомления через
              WhatsApp, чтобы получать сообщения о заявках, откликах и оплатах.
            </p>
          </div>
        )}
        {isTasker && (
          <div className="mb-6">
            <TaskerPayoutSetup />
          </div>
        )}
        {/* Avatar + Name */}
        <div className="text-center mb-6">
          <div className="relative w-20 h-20 mx-auto mb-4">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-border" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-emerald flex items-center justify-center">
                <User className="w-8 h-8 text-primary-foreground" />
              </div>
            )}
            <Popover open={avatarPopoverOpen} onOpenChange={setAvatarPopoverOpen}>
              <PopoverTrigger asChild>
                <button className="absolute bottom-0 end-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-md hover:opacity-90 transition-opacity">
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="center" className="w-44 p-2">
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-secondary transition-colors">
                  <Camera className="w-4 h-4" />
                  {t('profile.avatar.upload')}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleAvatarUpload(e); setAvatarPopoverOpen(false); }} disabled={uploadingAvatar} />
                </label>
                {profile?.avatar_url && (
                  <button
                    onClick={() => { handleAvatarDelete(); setAvatarPopoverOpen(false); }}
                    disabled={uploadingAvatar}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('profile.avatar.delete')}
                  </button>
                )}
              </PopoverContent>
            </Popover>
          </div>
          {uploadingAvatar && <p className="text-xs text-muted-foreground">{t('dashboard.loading')}</p>}
          <h1 className="text-2xl font-bold">{profile?.display_name || t('nav.profile')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
          {(profile as any)?.user_number && (
            <p className="text-xs text-muted-foreground mt-1">ID: {(profile as any).user_number}</p>
          )}
        </div>

        {/* Dashboard link */}
        <Link to="/dashboard"
          className="flex items-center justify-center gap-2 w-full mb-4 py-3 rounded-xl font-semibold text-sm bg-secondary text-foreground hover:bg-secondary/80 transition-colors">
          <LayoutDashboard className="w-4 h-4 text-primary" />
          {t('nav.dashboard')}
        </Link>


        <div className="space-y-4">
          {/* Roles */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('profile.roles')}</label>
            <div className="flex gap-2">
              {roleOptions.map((r) => {
                const isSelected = selectedRoles.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleRole(r.value)}
                    className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20'
                        : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                    )}
                    {r.label}
                  </button>
                );
              })}
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
            <label className="block text-sm font-medium mb-1.5">{isTasker ? t('profile.skills') : t('profile.about')}</label>
            <div className="relative">
              <FileText className="absolute start-3 top-3 w-4 h-4 text-muted-foreground" />
              <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4}
                placeholder={isTasker ? t('profile.skills.placeholder') : ''}
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

          {/* WhatsApp notifications */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">{t('whatsapp.section.title')}</h2>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.whatsapp_opt_in}
                onChange={(e) => setForm({ ...form, whatsapp_opt_in: e.target.checked })}
                className="mt-1"
              />
              <span className="flex-1">
                <span className="font-medium">{t('whatsapp.optin.label')}</span>
                <span className="block text-xs text-muted-foreground mt-1">
                  {t('whatsapp.optin.helper')}
                </span>
                <ul className="mt-1 ps-4 text-xs text-muted-foreground list-disc space-y-0.5">
                  <li>{t('whatsapp.optin.bullet.messages')}</li>
                  <li>{t('whatsapp.optin.bullet.proposals')}</li>
                  <li>{t('whatsapp.optin.bullet.payments')}</li>
                </ul>
                <span className="block text-[11px] text-muted-foreground mt-1 italic">
                  {t('whatsapp.no_marketing')}
                </span>
              </span>
            </label>
            {form.whatsapp_opt_in && (
              <div>
                <label className="block text-xs font-medium mb-1.5">{t('whatsapp.phone.label')}</label>
                <div className="relative">
                  <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="tel"
                    value={form.whatsapp_phone}
                    onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })}
                    placeholder={t('whatsapp.phone.placeholder')}
                    className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-line">{t('whatsapp.phone.hint')}</p>
              </div>
            )}
          </div>

          {/* Telegram notifications */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              {t('telegram.section.title')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('telegram.section.subtitle')}</p>
            <ul className="ps-4 text-xs text-muted-foreground list-disc space-y-0.5">
              <li>{t('telegram.bullet.messages')}</li>
              <li>{t('telegram.bullet.proposals')}</li>
              <li>{t('telegram.bullet.payments')}</li>
            </ul>

            {telegramLinked ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-primary">
                  {t('telegram.status.linked')}
                  {(profile as any)?.telegram_username && ` @${(profile as any).telegram_username}`}
                </p>
                <button
                  type="button"
                  onClick={handleUnlinkTelegram}
                  disabled={tgUnlinking}
                  className="w-full py-2 rounded-xl text-xs font-semibold border border-destructive text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  {tgUnlinking ? '...' : t('telegram.button.unlink')}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('telegram.status.not_linked')}</p>
                <button
                  type="button"
                  onClick={handleGenerateTelegramCode}
                  disabled={tgGenerating}
                  className="w-full py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {tgGenerating ? t('telegram.button.generating') : t('telegram.button.link')}
                </button>
                {tgCode && (
                  <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">{t('telegram.code.label')}</p>
                    <code className="block text-sm font-mono font-semibold break-all">{tgCode}</code>
                    <p className="text-xs text-muted-foreground">
                      {t('telegram.code.instructions').replace('{code}', tgCode)}
                    </p>
                    {tgDeepLink && (
                      <a
                        href={tgDeepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {t('telegram.code.open_bot')}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

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
