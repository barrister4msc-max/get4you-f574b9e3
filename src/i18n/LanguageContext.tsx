import React, { createContext, useContext, useState, useCallback } from 'react';
import { translations, Locale } from './translations';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
  currency: 'USD' | 'ILS';
  setCurrency: (c: 'USD' | 'ILS') => void;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [currency, setCurrency] = useState<'USD' | 'ILS'>('USD');

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.documentElement.dir = (l === 'he' || l === 'ar') ? 'rtl' : 'ltr';
    document.documentElement.lang = l;
    if (l === 'he') setCurrency('ILS');
    else setCurrency('USD');
  }, []);

  const t = useCallback((key: string) => {
    return translations[locale]?.[key] || translations.en[key] || key;
  }, [locale]);

  const dir = locale === 'he' ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, dir, currency, setCurrency }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
