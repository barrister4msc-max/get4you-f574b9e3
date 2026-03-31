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

const RATE = 3.7;

export const formatPrice = (amount: number, displayCurrency: 'USD' | 'ILS', sourceCurrency?: string | null) => {
  const src = (sourceCurrency || 'USD').toUpperCase();
  let valueInUSD = amount;
  if (src === 'ILS') valueInUSD = amount / RATE;

  if (displayCurrency === 'ILS') {
    const ils = Math.round(valueInUSD * RATE);
    return `₪${ils.toLocaleString()}`;
  }
  return `$${Math.round(valueInUSD).toLocaleString()}`;
};
