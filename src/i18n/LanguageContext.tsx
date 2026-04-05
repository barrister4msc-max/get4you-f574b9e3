import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translations, Locale } from './translations';
import { useExchangeRates } from '@/hooks/useExchangeRates';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
  currency: 'USD' | 'ILS';
  setCurrency: (c: 'USD' | 'ILS') => void;
  rates: Record<string, number>;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

const LOCALE_STORAGE_KEY = 'app-locale';

const isLocale = (value: string | null): value is Locale => {
  return value === 'en' || value === 'ru' || value === 'he' || value === 'ar';
};

const getInitialLocale = (): Locale => {
  if (typeof window === 'undefined') return 'en';
  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(storedLocale) ? storedLocale : 'en';
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [currency, setCurrency] = useState<'USD' | 'ILS'>('USD');
  const rates = useExchangeRates();

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
  }, []);

  useEffect(() => {
    document.documentElement.dir = (locale === 'he' || locale === 'ar') ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    setCurrency(locale === 'he' ? 'ILS' : 'USD');
  }, [locale]);

  const t = useCallback((key: string) => {
    return translations[locale]?.[key] || translations.en[key] || key;
  }, [locale]);

  const dir = (locale === 'he' || locale === 'ar') ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, dir, currency, setCurrency, rates }}>
      {children}
    </LanguageContext.Provider>
  );
};

const fallback: LanguageContextType = {
  locale: 'en',
  setLocale: () => {},
  t: (key: string) => translations.en[key] || key,
  dir: 'ltr',
  currency: 'USD',
  setCurrency: () => {},
  rates: { USD: 1, ILS: 3.7 },
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  return ctx ?? fallback;
};
