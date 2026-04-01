import { useCallback } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatPrice } from '@/components/CurrencyToggle';

/**
 * Returns a formatPrice function with live exchange rates already bound.
 * Drop-in replacement: `fp(amount, displayCurrency, sourceCurrency?)`.
 */
export function useFormatPrice() {
  const { rates } = useLanguage();
  return useCallback(
    (amount: number, displayCurrency: 'USD' | 'ILS', sourceCurrency?: string | null) =>
      formatPrice(amount, displayCurrency, sourceCurrency, rates),
    [rates],
  );
}
