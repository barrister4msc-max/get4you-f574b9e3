import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import type { Locale } from '@/i18n/translations';
import { ArrowLeft, Check, Globe, DollarSign } from 'lucide-react';

const localeFlags: Record<Locale, string> = { en: '🇺🇸', ru: '🇷🇺', he: '🇮🇱', ar: '🇸🇦' };
const localeLabels: Record<Locale, string> = { en: 'English', ru: 'Русский', he: 'עברית', ar: 'العربية' };
const localeOrder: Locale[] = ['en', 'ru', 'he', 'ar'];

const SettingsPage = () => {
  const { t, locale, setLocale, currency, setCurrency } = useLanguage();

  return (
    <div className="min-h-[80vh] py-8 animate-fade-in">
      <div className="container max-w-lg mx-auto px-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('nav.home')}
        </Link>

        <h1 className="text-2xl font-bold mb-6">{t('settings.title') || 'Настройки'}</h1>

        {/* Language */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('settings.language') || 'Язык'}
            </h2>
          </div>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {localeOrder.map((l, i) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-start transition-colors ${
                  i > 0 ? 'border-t border-border' : ''
                } ${locale === l ? 'bg-primary/5' : 'hover:bg-secondary/50'}`}
              >
                <span className="text-2xl leading-none">{localeFlags[l]}</span>
                <span className={`flex-1 text-sm font-medium ${locale === l ? 'text-primary font-semibold' : 'text-foreground'}`}>
                  {localeLabels[l]}
                </span>
                {locale === l && <Check className="w-5 h-5 text-primary" />}
              </button>
            ))}
          </div>
        </section>

        {/* Currency */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('settings.currency') || 'Валюта'}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'USD' as const, symbol: '$', name: 'US Dollar' },
              { value: 'ILS' as const, symbol: '₪', name: 'Israeli Shekel' },
            ]).map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCurrency(c.value)}
                className={`flex flex-col items-center gap-1 py-4 rounded-2xl border-2 transition-all ${
                  currency === c.value
                    ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]'
                    : 'border-border bg-card hover:border-primary/30'
                }`}
              >
                <span className={`text-2xl font-bold ${currency === c.value ? 'text-primary' : 'text-foreground'}`}>
                  {c.symbol}
                </span>
                <span className="text-xs text-muted-foreground">{c.name}</span>
                {currency === c.value && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                    <Check className="w-3 h-3" />
                    {c.value}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
