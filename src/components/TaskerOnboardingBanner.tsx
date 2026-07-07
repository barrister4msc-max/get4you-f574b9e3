import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, FileSignature } from 'lucide-react';
import { useTaskerOnboardingStatus } from '@/hooks/useTaskerOnboardingStatus';
import { useLanguage } from '@/i18n/LanguageContext';

const L: Record<string, { title: string; body: string; cta: string; agrTitle: string; agrBody: string; agrCta: string }> = {
  en: {
    title: 'Complete your Tasker profile',
    body: 'Finish onboarding to receive matching jobs automatically.',
    cta: 'Complete now',
    agrTitle: 'Sign your Tasker Agreement',
    agrBody: 'You must sign the Tasker Agreement to receive matching jobs and activate your profile.',
    agrCta: 'Sign now',
  },
  ru: {
    title: 'Завершите профиль исполнителя',
    body: 'Пройдите короткую настройку, чтобы автоматически получать подходящие задания.',
    cta: 'Завершить',
    agrTitle: 'Подпишите соглашение исполнителя',
    agrBody: 'Для получения подходящих задач и активации профиля необходимо подписать соглашение.',
    agrCta: 'Подписать',
  },
  he: {
    title: 'השלם את פרופיל המבצע',
    body: 'סיים את ההגדרה כדי לקבל משימות מתאימות אוטומטית.',
    cta: 'להשלים',
    agrTitle: 'חתום על הסכם המבצע',
    agrBody: 'יש לחתום על הסכם המבצע כדי לקבל משימות ולהפעיל את הפרופיל.',
    agrCta: 'לחתום',
  },
  ar: {
    title: 'أكمل ملف المنفّذ',
    body: 'أنهِ الإعداد لتصلك المهام المطابقة تلقائيًا.',
    cta: 'إكمال الآن',
    agrTitle: 'وقّع اتفاقية المنفّذ',
    agrBody: 'يجب توقيع اتفاقية المنفّذ لاستلام المهام وتفعيل الملف.',
    agrCta: 'التوقيع الآن',
  },
};

export default function TaskerOnboardingBanner() {
  const { loading, complete, isTasker, agreementSigned } = useTaskerOnboardingStatus();
  const { locale } = useLanguage();
  const t = L[locale] || L.en;
  if (loading || complete || !isTasker) return null;
  // If prefs/categories are done but agreement missing → show agreement banner.
  const agreementOnly = !agreementSigned;
  const to = agreementOnly ? '/onboarding/tasker/agreement' : '/onboarding/tasker';
  const title = agreementOnly ? t.agrTitle : t.title;
  const body = agreementOnly ? t.agrBody : t.body;
  const cta = agreementOnly ? t.agrCta : t.cta;
  return (
    <Link
      to={to}
      className="mb-5 flex items-start gap-3 p-4 rounded-2xl border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
    >
      <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
        {agreementOnly ? <FileSignature className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1 self-center px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
        {cta} <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}