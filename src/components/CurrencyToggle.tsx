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

const FALLBACK_RATE = 3.7;

/**
 * Convert and format a price for display.
 * @param amount - numeric amount
 * @param displayCurrency - target display currency ('USD' | 'ILS')
 * @param sourceCurrency - original currency of the amount (defaults to 'USD')
 * @param rates - live exchange rates (USD-based). If omitted, uses fallback.
 */
export const formatPrice = (
  amount: number,
  displayCurrency: 'USD' | 'ILS',
  sourceCurrency?: string | null,
  rates?: Record<string, number>,
) => {
  const ilsRate = rates?.ILS ?? FALLBACK_RATE;
  const src = (sourceCurrency || 'USD').toUpperCase();

  // Convert to USD first
  let valueInUSD = amount;
  if (src === 'ILS') valueInUSD = amount / ilsRate;

  if (displayCurrency === 'ILS') {
    const ils = Math.round(valueInUSD * ilsRate);
    return `₪${ils.toLocaleString()}`;
  }
  return `$${Math.round(valueInUSD).toLocaleString()}`;
};
