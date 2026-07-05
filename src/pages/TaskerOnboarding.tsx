import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, MapPin, Bell, Tags, Phone, Sparkles } from 'lucide-react';

type Category = { id: string; name_en: string; name_ru: string | null; name_he: string | null };

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

const L = {
  en: {
    step: 'Step', of: 'of',
    back: 'Back', next: 'Next', finish: 'Finish', saving: 'Saving…',
    s1title: 'What services do you offer?',
    s1hint: 'Pick at least one category. You will only receive notifications for these.',
    s2title: 'Where do you work?',
    s2city: 'City', s2cityPh: 'e.g. Tel Aviv',
    s2cityHint: 'Leave empty to receive tasks from any city.',
    s2radius: 'Radius (km)',
    s3title: 'How would you like to receive new jobs?',
    s3inapp: 'In-App (always on)', s3wa: 'WhatsApp', s3tg: 'Telegram', s3em: 'Email',
    s3freq: 'Frequency', s3instant: 'Instant', s3daily: 'Daily digest', s3off: 'Off',
    s4title: 'WhatsApp number',
    s4hint: "We'll send matching jobs to this number.",
    s4phone: 'Phone number', s4phonePh: '+972 5X XXX XXXX',
    s4consent: 'I agree to receive job notifications via WhatsApp.',
    s5title: 'Your tasker profile is ready',
    s5body: "You'll receive matching jobs automatically.",
    s5cta: 'Go to Dashboard',
    errCat: 'Choose at least one category.',
    errPhone: 'Enter your WhatsApp phone number.',
    errConsent: 'Consent is required for WhatsApp notifications.',
    saved: 'Profile saved',
  },
  ru: {
    step: 'Шаг', of: 'из',
    back: 'Назад', next: 'Далее', finish: 'Завершить', saving: 'Сохраняем…',
    s1title: 'Какие услуги вы оказываете?',
    s1hint: 'Выберите минимум одну категорию. Уведомления придут только по ним.',
    s2title: 'Где вы работаете?',
    s2city: 'Город', s2cityPh: 'например, Тель-Авив',
    s2cityHint: 'Оставьте пустым, чтобы получать задачи из любого города.',
    s2radius: 'Радиус (км)',
    s3title: 'Как получать новые задания?',
    s3inapp: 'В приложении (всегда)', s3wa: 'WhatsApp', s3tg: 'Telegram', s3em: 'Email',
    s3freq: 'Частота', s3instant: 'Мгновенно', s3daily: 'Ежедневная сводка', s3off: 'Отключено',
    s4title: 'Номер WhatsApp',
    s4hint: 'Мы будем отправлять подходящие задания на этот номер.',
    s4phone: 'Номер телефона', s4phonePh: '+972 5X XXX XXXX',
    s4consent: 'Я согласен получать уведомления о задачах через WhatsApp.',
    s5title: 'Профиль исполнителя готов',
    s5body: 'Вы будете получать подходящие задания автоматически.',
    s5cta: 'В личный кабинет',
    errCat: 'Выберите хотя бы одну категорию.',
    errPhone: 'Введите номер WhatsApp.',
    errConsent: 'Необходимо согласие на WhatsApp-уведомления.',
    saved: 'Профиль сохранён',
  },
  he: {
    step: 'שלב', of: 'מתוך',
    back: 'חזרה', next: 'המשך', finish: 'סיום', saving: 'שומר…',
    s1title: 'אילו שירותים אתה מציע?',
    s1hint: 'בחר לפחות קטגוריה אחת. תקבל התראות רק עבורן.',
    s2title: 'איפה אתה עובד?',
    s2city: 'עיר', s2cityPh: 'למשל תל אביב',
    s2cityHint: 'השאר ריק כדי לקבל משימות מכל עיר.',
    s2radius: 'רדיוס (ק״מ)',
    s3title: 'איך תרצה לקבל משימות חדשות?',
    s3inapp: 'באפליקציה (תמיד)', s3wa: 'WhatsApp', s3tg: 'Telegram', s3em: 'Email',
    s3freq: 'תדירות', s3instant: 'מיידי', s3daily: 'סיכום יומי', s3off: 'כבוי',
    s4title: 'מספר WhatsApp',
    s4hint: 'נשלח משימות מתאימות למספר הזה.',
    s4phone: 'מספר טלפון', s4phonePh: '+972 5X XXX XXXX',
    s4consent: 'אני מסכים לקבל התראות על משימות ב-WhatsApp.',
    s5title: 'פרופיל המבצע מוכן',
    s5body: 'תקבל משימות מתאימות אוטומטית.',
    s5cta: 'למרכז הבקרה',
    errCat: 'בחר לפחות קטגוריה אחת.',
    errPhone: 'הזן מספר WhatsApp.',
    errConsent: 'נדרשת הסכמה להתראות WhatsApp.',
    saved: 'הפרופיל נשמר',
  },
};

function pickLang(l: string): keyof typeof L {
  if (l === 'ru') return 'ru';
  if (l === 'he') return 'he';
  return 'en';
}

export default function TaskerOnboarding() {
  const { user } = useAuth();
  const { locale } = useLanguage();
  const navigate = useNavigate();
  const t = L[pickLang(locale)];

  const [step, setStep] = useState(1);
  const totalSteps = 5;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState(25);

  const [inApp] = useState(true);
  const [waEnabled, setWaEnabled] = useState(true);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [frequency, setFrequency] = useState<'instant' | 'daily' | 'off'>('instant');

  const [waPhone, setWaPhone] = useState('');
  const [waConsent, setWaConsent] = useState(false);
  const [initialConsent, setInitialConsent] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [catsRes, profRes, prefRes, tscRes] = await Promise.all([
        supabase.from('categories').select('id, name_en, name_ru, name_he').order('sort_order', { ascending: true }),
        supabase.from('profiles').select('city, phone, whatsapp_phone, whatsapp_opt_in').eq('user_id', user.id).maybeSingle(),
        (supabase.from('tasker_notification_preferences' as any) as any).select('*').eq('user_id', user.id).maybeSingle(),
        (supabase.from('tasker_service_categories' as any) as any).select('category_id').eq('user_id', user.id),
      ]);
      if (cancelled) return;
      setCategories((catsRes.data as Category[]) ?? []);
      const prof: any = profRes.data || {};
      const pref: any = prefRes.data || null;
      const tsc = (tscRes.data as { category_id: string }[]) ?? [];
      setSelected(new Set(tsc.map(r => r.category_id)));
      setCity(pref?.city ?? prof.city ?? '');
      setRadiusKm(pref?.radius_km ?? 25);
      if (pref) {
        setWaEnabled(!!pref.whatsapp_enabled);
        setTgEnabled(!!pref.telegram_enabled);
        setEmailEnabled(!!pref.email_enabled);
        setFrequency((pref.frequency as any) ?? 'instant');
      }
      setWaPhone(prof.whatsapp_phone || prof.phone || '');
      const consent = !!prof.whatsapp_opt_in;
      setWaConsent(consent);
      setInitialConsent(consent);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const label = useMemo(() => (c: Category) => {
    if (locale === 'ru') return c.name_ru || c.name_en;
    if (locale === 'he') return c.name_he || c.name_en;
    return c.name_en;
  }, [locale]);

  const toggleCategory = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const canNext = () => {
    if (step === 1) return selected.size > 0;
    if (step === 4 && waEnabled) return waPhone.trim().length >= 6 && waConsent;
    return true;
  };

  const goNext = () => {
    if (!canNext()) {
      if (step === 1) toast.error(t.errCat);
      else if (step === 4 && !waPhone.trim()) toast.error(t.errPhone);
      else if (step === 4 && !waConsent) toast.error(t.errConsent);
      return;
    }
    // If WA disabled, skip step 4
    if (step === 3 && !waEnabled) {
      handleFinish();
      return;
    }
    if (step === 4) {
      handleFinish();
      return;
    }
    setStep(s => Math.min(totalSteps, s + 1));
  };

  const goBack = () => setStep(s => Math.max(1, s - 1));

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Save prefs
      const { error: pErr } = await (supabase.from('tasker_notification_preferences' as any) as any)
        .upsert({
          user_id: user.id,
          city: city.trim() || null,
          radius_km: radiusKm,
          notify_new_matching_tasks: frequency !== 'off',
          whatsapp_enabled: waEnabled,
          telegram_enabled: tgEnabled,
          email_enabled: emailEnabled,
          frequency: frequency === 'off' ? 'instant' : frequency,
        }, { onConflict: 'user_id' });
      if (pErr) throw pErr;

      // Sync categories
      const existingRes = await (supabase.from('tasker_service_categories' as any) as any)
        .select('category_id').eq('user_id', user.id);
      const existing = new Set(((existingRes.data as { category_id: string }[]) ?? []).map(r => r.category_id));
      const toAdd: string[] = [];
      const toRemove: string[] = [];
      selected.forEach(id => { if (!existing.has(id)) toAdd.push(id); });
      existing.forEach(id => { if (!selected.has(id)) toRemove.push(id); });
      if (toAdd.length) {
        const rows = toAdd.map(category_id => ({ user_id: user.id, category_id }));
        const { error } = await (supabase.from('tasker_service_categories' as any) as any).insert(rows);
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase.from('tasker_service_categories' as any)
          .delete().eq('user_id', user.id).in('category_id', toRemove);
        if (error) throw error;
      }

      // Update profile whatsapp fields if WA enabled
      if (waEnabled) {
        const patch: any = { whatsapp_phone: waPhone.trim(), whatsapp_opt_in: true };
        if (!initialConsent && waConsent) patch.whatsapp_opt_in_at = new Date().toISOString();
        const { error: profErr } = await supabase.from('profiles').update(patch).eq('user_id', user.id);
        if (profErr) throw profErr;
      }

      toast.success(t.saved);
      setStep(5);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] py-8">
      <div className="container max-w-lg mx-auto px-4">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t.step} {step} {t.of} {totalSteps}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Tags className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold">{t.s1title}</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">{t.s1hint}</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(c => {
                  const active = selected.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategory(c.id)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors flex items-center gap-1 ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {active && <CheckCircle2 className="w-3 h-3" />}
                      {label(c)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold">{t.s2title}</h2>
              </div>
              <label className="block text-xs font-medium mb-1.5">{t.s2city}</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder={t.s2cityPh}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">{t.s2cityHint}</p>
              <div className="mt-4">
                <label className="block text-xs font-medium mb-2">{t.s2radius}</label>
                <div className="flex flex-wrap gap-1.5">
                  {RADIUS_OPTIONS.map(km => (
                    <button
                      key={km}
                      type="button"
                      onClick={() => setRadiusKm(km)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                        radiusKm === km ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                      }`}
                    >{km} km</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold">{t.s3title}</h2>
              </div>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2 opacity-70">
                  <input type="checkbox" checked={inApp} disabled /> {t.s3inapp}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={waEnabled} onChange={e => setWaEnabled(e.target.checked)} /> {t.s3wa}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tgEnabled} onChange={e => setTgEnabled(e.target.checked)} /> {t.s3tg}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={emailEnabled} onChange={e => setEmailEnabled(e.target.checked)} /> {t.s3em}
                </label>
              </div>
              <div className="mt-4">
                <label className="text-xs font-medium mb-2 block">{t.s3freq}</label>
                <div className="flex gap-2 text-sm">
                  {(['instant', 'daily', 'off'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrequency(f)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium ${
                        frequency === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                      }`}
                    >{f === 'instant' ? t.s3instant : f === 'daily' ? t.s3daily : t.s3off}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Phone className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold">{t.s4title}</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">{t.s4hint}</p>
              <label className="block text-xs font-medium mb-1.5">{t.s4phone}</label>
              <input
                type="tel"
                value={waPhone}
                onChange={e => setWaPhone(e.target.value)}
                placeholder={t.s4phonePh}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <label className="mt-4 flex items-start gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={waConsent}
                  onChange={e => setWaConsent(e.target.checked)}
                />
                <span>{t.s4consent}</span>
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-primary/15 text-primary flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-semibold mb-2">{t.s5title}</h2>
              <p className="text-sm text-muted-foreground mb-6">{t.s5body}</p>
              <button
                type="button"
                onClick={() => navigate('/dashboard', { replace: true })}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90"
              >{t.s5cta}</button>
            </div>
          )}

          {step < 5 && (
            <div className="flex items-center justify-between pt-2 gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1 || saving}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground disabled:opacity-40"
              >
                <ArrowLeft className="w-4 h-4" /> {t.back}
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={saving}
                className="inline-flex items-center gap-1 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {saving ? t.saving : (step === 4 || (step === 3 && !waEnabled) ? t.finish : t.next)}
                {!saving && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}