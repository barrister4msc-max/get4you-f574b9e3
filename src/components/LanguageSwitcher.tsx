import { useLanguage } from '@/i18n/LanguageContext';
import type { Locale } from '@/i18n/translations';
import { Globe, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const flags: Record<Locale, string> = { en: '🇺🇸', ru: '🇷🇺', he: '🇮🇱' };
const labels: Record<Locale, string> = { en: 'English', ru: 'Русский', he: 'עברית' };

export const LanguageSwitcher = () => {
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-foreground/80 hover:bg-secondary transition-colors"
      >
        <Globe className="w-4 h-4" />
        <span>{flags[locale]}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 end-0 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px] z-50">
          {(Object.keys(flags) as Locale[]).map((l) => (
            <button
              key={l}
              onClick={() => { setLocale(l); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors ${
                locale === l ? 'text-primary font-semibold' : 'text-foreground'
              }`}
            >
              <span>{flags[l]}</span>
              <span>{labels[l]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
