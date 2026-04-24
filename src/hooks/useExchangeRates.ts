import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const FALLBACK_RATES: Record<string, number> = { USD: 1, ILS: 3.7 };

export function useExchangeRates() {
  const { data } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('exchange-rates');
        if (error) throw error;
        return data as { rates: Record<string, number>; fetchedAt: number };
      } catch (err) {
        // Transient 503/cold-start — fall back to defaults silently
        console.warn('[exchange-rates] fallback used:', err);
        return { rates: FALLBACK_RATES, fetchedAt: Date.now() };
      }
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  return data?.rates ?? FALLBACK_RATES;
}
