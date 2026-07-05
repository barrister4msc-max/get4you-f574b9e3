import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import { CheckCircle2, Save, Tags, MapPin, Bell } from 'lucide-react';

type Category = { id: string; name_en: string; name_ru: string | null; name_he: string | null };

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

const L = {
  en: {
    title: 'Task Preferences',
    subtitle: 'Choose which tasks you want to be notified about.',
    categories: 'Service categories',
    categoriesHint: 'Pick at least one category. You will only receive notifications for tasks in these categories.',
    categoriesEmpty: 'Choose at least one category to receive new tasks.',
    region: 'Region',
    city: 'City (matched against task city)',
    cityHint: 'Leave empty to receive tasks from any city.',
    radius: 'Radius (km)',
    channels: 'Notification channels',
    inApp: 'In-App (always on)',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    email: 'Email',
    frequency: 'Frequency',
    instant: 'Instant',
    daily: 'Daily digest',
    notifyToggle: 'Notify me about new matching tasks',
    save: 'Save preferences',
    saved: 'Preferences saved',
    loading: 'Loading…',
    waPhoneMissing: 'Add a WhatsApp phone number in your profile to enable WhatsApp notifications.',
    waConsentMissing: 'Please give WhatsApp consent in your profile to enable WhatsApp notifications.',
  },
  ru: {
    title: 'Настройки заказов',
    subtitle: 'Выберите, о каких задачах присылать уведомления.',
    categories: 'Категории услуг',
    categoriesHint: 'Выберите хотя бы одну категорию. Уведомления придут только по этим категориям.',
    categoriesEmpty: 'Выберите хотя бы одну категорию, чтобы получать новые задачи.',
    region: 'Регион',
    city: 'Город (сравнивается с городом задачи)',
    cityHint: 'Оставьте пустым, чтобы получать задачи из любого города.',
    radius: 'Радиус (км)',
    channels: 'Каналы уведомлений',
    inApp: 'В приложении (всегда)',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    email: 'Email',
    frequency: 'Частота',
    instant: 'Мгновенно',
    daily: 'Ежедневная сводка',
    notifyToggle: 'Уведомлять о новых подходящих задачах',
    save: 'Сохранить настройки',
    saved: 'Настройки сохранены',
    loading: 'Загрузка…',
    waPhoneMissing: 'Добавьте номер WhatsApp в профиле, чтобы включить WhatsApp-уведомления.',
    waConsentMissing: 'Дайте согласие на WhatsApp в профиле, чтобы включить WhatsApp-уведомления.',
  },
  he: {
    title: 'העדפות משימות',
    subtitle: 'בחר על אילו משימות לקבל התראות.',
    categories: 'קטגוריות שירות',
    categoriesHint: 'בחר לפחות קטגוריה אחת. התראות יישלחו רק עבור קטגוריות אלו.',
    categoriesEmpty: 'בחר לפחות קטגוריה אחת כדי לקבל משימות חדשות.',
    region: 'אזור',
    city: 'עיר (מותאמת לעיר המשימה)',
    cityHint: 'השאר ריק כדי לקבל משימות מכל עיר.',
    radius: 'רדיוס (ק״מ)',
    channels: 'ערוצי התראה',
    inApp: 'באפליקציה (תמיד)',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    email: 'Email',
    frequency: 'תדירות',
    instant: 'מיידי',
    daily: 'סיכום יומי',
    notifyToggle: 'הודיעו לי על משימות חדשות מתאימות',
    save: 'שמור העדפות',
    saved: 'ההעדפות נשמרו',
    loading: 'טוען…',
    waPhoneMissing: 'הוסף מספר WhatsApp בפרופיל כדי להפעיל התראות WhatsApp.',
    waConsentMissing: 'תן הסכמה ל-WhatsApp בפרופיל כדי להפעיל התראות WhatsApp.',
  },
};

function pickLang(lang: string): keyof typeof L {
  if (lang === 'ru') return 'ru';
  if (lang === 'he') return 'he';
  return 'en';
}

export default function TaskerPreferences({ initialCity }: { initialCity?: string | null }) {
  const { user } = useAuth();
  const { locale } = useLanguage();
  const language = locale;
  const t = L[pickLang(language)];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());

  const [city, setCity] = useState<string>('');
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [waEnabled, setWaEnabled] = useState(false);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [frequency, setFrequency] = useState<'instant' | 'daily'>('instant');
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waOptIn, setWaOptIn] = useState<boolean>(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [catsRes, tscRes, tnpRes] = await Promise.all([
        supabase.from('categories').select('id, name_en, name_ru, name_he').order('sort_order', { ascending: true }),
        (supabase.from('tasker_service_categories' as any) as any).select('category_id').eq('user_id', user.id),
        (supabase.from('tasker_notification_preferences' as any) as any).select('*').eq('user_id', user.id).maybeSingle(),
      ]);
      const profRes = await supabase
        .from('profiles')
        .select('whatsapp_phone, whatsapp_opt_in, phone')
        .eq('user_id', user.id)
        .maybeSingle();
      const cats = catsRes.data;
      const tsc = tscRes.data as { category_id: string }[] | null;
      const tnp = tnpRes.data as Record<string, unknown> | null;
      if (cancelled) return;
      const prof = profRes.data as { whatsapp_phone: string | null; whatsapp_opt_in: boolean | null; phone: string | null } | null;
      setWaPhone(prof?.whatsapp_phone || prof?.phone || null);
      setWaOptIn(!!prof?.whatsapp_opt_in);
      setCategories((cats as Category[]) ?? []);
      setSelectedCategoryIds(new Set((tsc ?? []).map(r => r.category_id)));
      const p = tnp as any;
      if (p) {
        setCity(p.city ?? (initialCity ?? ''));
        setRadiusKm(p.radius_km ?? 25);
        setNotifyEnabled(!!p.notify_new_matching_tasks);
        setWaEnabled(!!p.whatsapp_enabled);
        setTgEnabled(!!p.telegram_enabled);
        setEmailEnabled(!!p.email_enabled);
        setFrequency((p.frequency as 'instant' | 'daily') ?? 'instant');
      } else {
        setCity(initialCity ?? '');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, initialCity]);

  const label = useMemo(() => (c: Category) => {
    if (language === 'ru') return c.name_ru || c.name_en;
    if (language === 'he') return c.name_he || c.name_en;
    return c.name_en;
  }, [language]);

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const waPhoneMissing = waEnabled && !waPhone;
  const waConsentMissing = waEnabled && !waOptIn;
  const canSave = selectedCategoryIds.size > 0 && !waPhoneMissing && !waConsentMissing;

  const handleSave = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    try {
      // Upsert prefs
      const { error: upErr } = await (supabase.from('tasker_notification_preferences' as any) as any)
        .upsert({
          user_id: user.id,
          city: city.trim() || null,
          radius_km: radiusKm,
          notify_new_matching_tasks: notifyEnabled,
          whatsapp_enabled: waEnabled,
          telegram_enabled: tgEnabled,
          email_enabled: emailEnabled,
          frequency,
        }, { onConflict: 'user_id' });
      if (upErr) throw upErr;

      // Sync categories: read current then diff
      const existingRes = await (supabase.from('tasker_service_categories' as any) as any)
        .select('category_id')
        .eq('user_id', user.id);
      const existing = existingRes.data as { category_id: string }[] | null;
      const currentIds = new Set((existing ?? []).map(r => r.category_id));
      const toAdd: string[] = [];
      const toRemove: string[] = [];
      selectedCategoryIds.forEach(id => { if (!currentIds.has(id)) toAdd.push(id); });
      currentIds.forEach(id => { if (!selectedCategoryIds.has(id)) toRemove.push(id); });
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
      toast.success(t.saved);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t.loading}</div>;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">{t.title}</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{t.subtitle}</p>

      {/* Categories */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-medium mb-2">
          <Tags className="w-3.5 h-3.5" /> {t.categories}
        </label>
        <div className="flex flex-wrap gap-2">
          {categories.map(c => {
            const active = selectedCategoryIds.has(c.id);
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
        {selectedCategoryIds.size === 0 ? (
          <p className="mt-2 text-[11px] text-destructive">{t.categoriesEmpty}</p>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">{t.categoriesHint}</p>
        )}
      </div>

      {/* Region */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-medium mb-2">
          <MapPin className="w-3.5 h-3.5" /> {t.region}
        </label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={t.city}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t.cityHint}</p>
        <div className="mt-2">
          <label className="block text-[11px] font-medium mb-1">{t.radius}</label>
          <div className="flex flex-wrap gap-1.5">
            {RADIUS_OPTIONS.map(km => (
              <button
                key={km}
                type="button"
                onClick={() => setRadiusKm(km)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                  radiusKm === km ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                }`}
              >{km} km</button>
            ))}
          </div>
        </div>
      </div>

      {/* Channels */}
      <div>
        <label className="text-xs font-medium mb-2 block">{t.channels}</label>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2 opacity-70">
            <input type="checkbox" checked disabled /> {t.inApp}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={waEnabled} onChange={(e) => setWaEnabled(e.target.checked)} /> {t.whatsapp}
          </label>
          {waPhoneMissing && (
            <p className="text-[11px] text-destructive pl-6">{t.waPhoneMissing}</p>
          )}
          {!waPhoneMissing && waConsentMissing && (
            <p className="text-[11px] text-destructive pl-6">{t.waConsentMissing}</p>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} /> {t.telegram}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} /> {t.email}
          </label>
        </div>
      </div>

      {/* Frequency */}
      <div>
        <label className="text-xs font-medium mb-2 block">{t.frequency}</label>
        <div className="flex gap-2 text-sm">
          {(['instant', 'daily'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium ${
                frequency === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
              }`}
            >{f === 'instant' ? t.instant : t.daily}</button>
          ))}
        </div>
      </div>

      {/* Notify master */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={notifyEnabled} onChange={(e) => setNotifyEnabled(e.target.checked)} />
        {t.notifyToggle}
      </label>

      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave || saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {saving ? '…' : t.save}
      </button>
    </div>
  );
}