import { useLanguage } from '@/i18n/LanguageContext';
import { DollarSign } from 'lucide-react';

export const CurrencyToggle = () => {
  const { currency, setCurrency } = useLanguage();

  return (
    <button
      onClick={() => setCurrency(currency === 'USD' ? 'ILS' : 'USD')}
      className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:bg-secondary transition-colors"
    >
      <DollarSign className="w-3.5 h-3.5" />
      {currency}
    </button>
  );
};

export const formatPrice = (usd: number, currency: 'USD' | 'ILS') => {
  if (currency === 'ILS') {
    const ils = Math.round(usd * 3.7);
    return `₪${ils.toLocaleString()}`;
  }
  return `$${usd.toLocaleString()}`;
};
