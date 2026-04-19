import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translations, Locale } from './translations';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { supabase } from '@/integrations/supabase/client';

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
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {}
  return 'en';
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [currency, setCurrency] = useState<'USD' | 'ILS'>('USD');
  const rates = useExchangeRates();

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    // Persist to profile if logged in (fire & forget)
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      supabase.from('profiles').update({ preferred_language: l }).eq('user_id', uid).then(() => {});
    });
  }, []);

  useEffect(() => {
    document.documentElement.dir = (locale === 'he' || locale === 'ar') ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  // Load preferred_language from profile on auth change (only if user hasn't explicitly chosen)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id;
      if (!uid) return;
      setTimeout(async () => {
        const { data } = await supabase
          .from('profiles')
          .select('preferred_language')
          .eq('user_id', uid)
          .maybeSingle();
        const lang = data?.preferred_language;
        if (isLocale(lang)) setLocaleState(lang);
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, []);

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
