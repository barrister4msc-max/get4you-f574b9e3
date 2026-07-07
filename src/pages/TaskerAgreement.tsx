import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import { FileSignature, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import {
  AGREEMENT_VERSION,
  getAgreementText,
  hashAgreementText,
} from '@/lib/taskerAgreementText';

const L: Record<string, any> = {
  en: {
    title: 'Tasker Agreement',
    subtitle: 'Read the full agreement and sign it to activate your tasker profile.',
    scrollHint: 'Please scroll to the end of the agreement to enable signing.',
    scrolledOk: 'Agreement read.',
    section1: 'Your details',
    legalName: 'Full legal name',
    phone: 'Phone',
    waPhone: 'WhatsApp phone',
    country: 'Country',
    city: 'City',
    taxStatus: 'Tax status',
    taxIndividual: 'Individual',
    taxSelfEmployed: 'Self-employed (Esek Patur)',
    taxCompany: 'Company',
    payoutMethod: 'Payout method',
    payoutBank: 'Bank transfer',
    payoutPaypal: 'PayPal',
    payoutCash: 'Cash / Check',
    section2: 'Confirmations',
    cb1: 'I have read and accept the Tasker Agreement',
    cb2: 'I agree to receive task notifications',
    cb3: 'I confirm that the information I provided is accurate',
    cb4: 'I understand that payouts are subject to platform rules and service fees',
    cbWa: 'I agree to receive task notifications via WhatsApp',
    sign: 'Sign Agreement',
    signing: 'Signing…',
    back: 'Back',
    signed: 'Agreement signed',
    signedTitle: 'Agreement already signed',
    signedBody: 'You signed the tasker agreement on {date} (v{v}).',
    goDash: 'Go to Dashboard',
    errRequired: 'Please fill in all required fields.',
    errChecks: 'Please tick all required checkboxes.',
    errScroll: 'Please read the agreement to the end.',
    errWaPhone: 'WhatsApp phone is required when WhatsApp is enabled.',
  },
  ru: {
    title: 'Соглашение исполнителя',
    subtitle: 'Прочитайте полный текст и подпишите, чтобы активировать профиль исполнителя.',
    scrollHint: 'Прокрутите текст до конца, чтобы подписать соглашение.',
    scrolledOk: 'Соглашение прочитано.',
    section1: 'Ваши данные',
    legalName: 'Полное юридическое имя',
    phone: 'Телефон',
    waPhone: 'WhatsApp',
    country: 'Страна',
    city: 'Город',
    taxStatus: 'Налоговый статус',
    taxIndividual: 'Физлицо',
    taxSelfEmployed: 'Самозанятый (Esek Patur)',
    taxCompany: 'Компания',
    payoutMethod: 'Способ выплаты',
    payoutBank: 'Банковский перевод',
    payoutPaypal: 'PayPal',
    payoutCash: 'Наличные / Чек',
    section2: 'Подтверждения',
    cb1: 'Я прочитал(а) и принимаю Соглашение исполнителя',
    cb2: 'Я согласен(на) получать уведомления о задачах',
    cb3: 'Я подтверждаю, что предоставленные данные достоверны',
    cb4: 'Я понимаю, что выплаты регулируются правилами платформы и комиссиями',
    cbWa: 'Я согласен(на) получать уведомления в WhatsApp',
    sign: 'Подписать соглашение',
    signing: 'Подписываем…',
    back: 'Назад',
    signed: 'Соглашение подписано',
    signedTitle: 'Соглашение уже подписано',
    signedBody: 'Вы подписали соглашение исполнителя {date} (v{v}).',
    goDash: 'В личный кабинет',
    errRequired: 'Пожалуйста, заполните все обязательные поля.',
    errChecks: 'Отметьте все обязательные пункты.',
    errScroll: 'Прокрутите текст соглашения до конца.',
    errWaPhone: 'Укажите номер WhatsApp при включённой опции.',
  },
  he: {
    title: 'הסכם מבצע',
    subtitle: 'קרא את ההסכם המלא וחתום כדי להפעיל את פרופיל המבצע.',
    scrollHint: 'גלול לסוף ההסכם כדי לחתום.',
    scrolledOk: 'ההסכם נקרא.',
    section1: 'הפרטים שלך',
    legalName: 'שם מלא',
    phone: 'טלפון',
    waPhone: 'WhatsApp',
    country: 'מדינה',
    city: 'עיר',
    taxStatus: 'סטטוס מס',
    taxIndividual: 'פרטי',
    taxSelfEmployed: 'עצמאי (עוסק פטור)',
    taxCompany: 'חברה',
    payoutMethod: 'אמצעי תשלום',
    payoutBank: 'העברה בנקאית',
    payoutPaypal: 'PayPal',
    payoutCash: 'מזומן / צ׳ק',
    section2: 'אישורים',
    cb1: 'קראתי ואני מסכים להסכם המבצע',
    cb2: 'אני מסכים לקבל התראות על משימות',
    cb3: 'אני מאשר שהמידע שסיפקתי מדויק',
    cb4: 'אני מבין שהתשלומים כפופים לכללי הפלטפורמה ולעמלות',
    cbWa: 'אני מסכים לקבל התראות ב-WhatsApp',
    sign: 'חתום על ההסכם',
    signing: 'חותם…',
    back: 'חזרה',
    signed: 'ההסכם נחתם',
    signedTitle: 'ההסכם כבר נחתם',
    signedBody: 'חתמת על הסכם המבצע בתאריך {date} (v{v}).',
    goDash: 'למרכז הבקרה',
    errRequired: 'נא למלא את כל השדות.',
    errChecks: 'נא לסמן את כל האישורים.',
    errScroll: 'נא לקרוא את ההסכם עד הסוף.',
    errWaPhone: 'נדרש מספר WhatsApp כאשר האפשרות מופעלת.',
  },
};

function pickL(l: string) {
  if (l === 'ru') return L.ru;
  if (l === 'he') return L.he;
  return L.en;
}

export default function TaskerAgreementPage() {
  const { user } = useAuth();
  const { locale } = useLanguage();
  const navigate = useNavigate();
  const t = pickL(locale);

  const { text: agreementText, locale: agreementLocale } = useMemo(
    () => getAgreementText(locale),
    [locale]
  );

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<{ signed_at: string; agreement_version: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);

  const [legalName, setLegalName] = useState('');
  const [phone, setPhone] = useState('');
  const [waPhone, setWaPhone] = useState('');
  const [country, setCountry] = useState('Israel');
  const [city, setCity] = useState('');
  const [taxStatus, setTaxStatus] = useState('individual');
  const [payoutMethod, setPayoutMethod] = useState('bank');
  const [waEnabled, setWaEnabled] = useState(true);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  const [cb1, setCb1] = useState(false);
  const [cb2, setCb2] = useState(false);
  const [cb3, setCb3] = useState(false);
  const [cb4, setCb4] = useState(false);
  const [cbWa, setCbWa] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [existingRes, profRes, prefRes, catsRes] = await Promise.all([
        (supabase.from('tasker_agreements' as any) as any)
          .select('signed_at, agreement_version')
          .eq('user_id', user.id)
          .eq('agreement_version', AGREEMENT_VERSION)
          .order('signed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('profiles')
          .select('display_name, first_name, last_name, phone, whatsapp_phone, whatsapp_opt_in, city')
          .eq('user_id', user.id).maybeSingle(),
        (supabase.from('tasker_notification_preferences' as any) as any)
          .select('whatsapp_enabled, city').eq('user_id', user.id).maybeSingle(),
        (supabase.from('tasker_service_categories' as any) as any)
          .select('category_id').eq('user_id', user.id),
      ]);
      if (cancelled) return;
      if (existingRes?.data) setExisting(existingRes.data as any);
      const prof: any = profRes.data || {};
      const pref: any = prefRes.data || {};
      const fullName = prof.display_name
        || [prof.first_name, prof.last_name].filter(Boolean).join(' ');
      setLegalName(fullName || '');
      setPhone(prof.phone || '');
      setWaPhone(prof.whatsapp_phone || prof.phone || '');
      setCity(pref.city || prof.city || '');
      setWaEnabled(pref.whatsapp_enabled ?? prof.whatsapp_opt_in ?? true);
      setCategoryIds(((catsRes?.data as { category_id: string }[]) ?? []).map(r => r.category_id));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setScrolledEnd(true);
  };

  const handleSign = async () => {
    if (!user) return;
    if (!scrolledEnd) { toast.error(t.errScroll); return; }
    if (!legalName.trim() || !phone.trim() || !country.trim() || !city.trim() || !taxStatus || !payoutMethod) {
      toast.error(t.errRequired); return;
    }
    if (waEnabled && !waPhone.trim()) { toast.error(t.errWaPhone); return; }
    if (!cb1 || !cb2 || !cb3 || !cb4) { toast.error(t.errChecks); return; }
    if (waEnabled && !cbWa) { toast.error(t.errChecks); return; }

    setSaving(true);
    try {
      const snapshotHash = await hashAgreementText(agreementText);
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const { error } = await (supabase.from('tasker_agreements' as any) as any).insert({
        user_id: user.id,
        agreement_type: 'tasker_agreement',
        agreement_version: AGREEMENT_VERSION,
        locale: agreementLocale,
        legal_name: legalName.trim(),
        phone: phone.trim() || null,
        whatsapp_phone: waEnabled ? (waPhone.trim() || null) : null,
        country: country.trim(),
        city: city.trim(),
        tax_status: taxStatus,
        payout_method: payoutMethod,
        service_categories: categoryIds,
        accepted_terms: cb1 && cb3 && cb4,
        accepted_notifications: cb2,
        accepted_whatsapp: waEnabled ? cbWa : false,
        user_agent: ua,
        snapshot_text: agreementText,
        snapshot_text_hash: snapshotHash,
      });
      if (error) throw error;
      toast.success(t.signed);
      navigate('/dashboard', { replace: true });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to sign');
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

  if (existing) {
    return (
      <div className="py-12">
        <div className="container max-w-2xl text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{t.signedTitle}</h1>
          <p className="text-muted-foreground">
            {t.signedBody
              .replace('{date}', new Date(existing.signed_at).toLocaleString())
              .replace('{v}', existing.agreement_version)}
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
          >{t.goDash}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] py-8">
      <div className="container max-w-2xl mx-auto px-4 space-y-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-muted"
            aria-label={t.back}
          ><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-primary" /> {t.title}
            </h1>
            <p className="text-sm text-muted-foreground">{t.subtitle}</p>
          </div>
        </div>

        {/* Agreement text scroll box */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="rounded-2xl border border-border bg-card p-4 h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed"
        >
          {agreementText}
        </div>
        <p className={`text-xs ${scrolledEnd ? 'text-primary' : 'text-muted-foreground'}`}>
          {scrolledEnd ? `✓ ${t.scrolledOk}` : t.scrollHint}
        </p>

        {/* Details */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">{t.section1}</h2>
          <Field label={t.legalName + ' *'} value={legalName} onChange={setLegalName} />
          <Field label={t.phone + ' *'} value={phone} onChange={setPhone} type="tel" />
          {waEnabled && (
            <Field label={t.waPhone + ' *'} value={waPhone} onChange={setWaPhone} type="tel" />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.country + ' *'} value={country} onChange={setCountry} />
            <Field label={t.city + ' *'} value={city} onChange={setCity} />
          </div>
          <Select
            label={t.taxStatus + ' *'}
            value={taxStatus}
            onChange={setTaxStatus}
            options={[
              { value: 'individual', label: t.taxIndividual },
              { value: 'self_employed', label: t.taxSelfEmployed },
              { value: 'company', label: t.taxCompany },
            ]}
          />
          <Select
            label={t.payoutMethod + ' *'}
            value={payoutMethod}
            onChange={setPayoutMethod}
            options={[
              { value: 'bank', label: t.payoutBank },
              { value: 'paypal', label: t.payoutPaypal },
              { value: 'cash', label: t.payoutCash },
            ]}
          />
        </div>

        {/* Checkboxes */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">{t.section2}</h2>
          <Check id="cb1" checked={cb1} onChange={setCb1} label={t.cb1} />
          <Check id="cb2" checked={cb2} onChange={setCb2} label={t.cb2} />
          <Check id="cb3" checked={cb3} onChange={setCb3} label={t.cb3} />
          <Check id="cb4" checked={cb4} onChange={setCb4} label={t.cb4} />
          {waEnabled && <Check id="cbWa" checked={cbWa} onChange={setCbWa} label={t.cbWa} />}
        </div>

        <button
          type="button"
          onClick={handleSign}
          disabled={saving || !scrolledEnd}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
          {saving ? t.signing : t.sign}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Check({ id, checked, onChange, label }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm cursor-pointer">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}