import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useTaskerOnboardingStatus } from '@/hooks/useTaskerOnboardingStatus';
import { useLanguage } from '@/i18n/LanguageContext';

const L: Record<string, { title: string; body: string; cta: string }> = {
  en: {
    title: 'Complete your Tasker profile',
    body: 'Finish onboarding to receive matching jobs automatically.',
    cta: 'Complete now',
  },
  ru: {
    title: 'Завершите профиль исполнителя',
    body: 'Пройдите короткую настройку, чтобы автоматически получать подходящие задания.',
    cta: 'Завершить',
  },
  he: {
    title: 'השלם את פרופיל המבצע',
    body: 'סיים את ההגדרה כדי לקבל משימות מתאימות אוטומטית.',
    cta: 'להשלים',
  },
  ar: {
    title: 'أكمل ملف المنفّذ',
    body: 'أنهِ الإعداد لتصلك المهام المطابقة تلقائيًا.',
    cta: 'إكمال الآن',
  },
};

export default function TaskerOnboardingBanner() {
  const { loading, complete, isTasker } = useTaskerOnboardingStatus();
  const { locale } = useLanguage();
  const t = L[locale] || L.en;
  if (loading || complete || !isTasker) return null;
  return (
    <Link
      to="/onboarding/tasker"
      className="mb-5 flex items-start gap-3 p-4 rounded-2xl border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
    >
      <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{t.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t.body}</p>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1 self-center px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
        {t.cta} <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}