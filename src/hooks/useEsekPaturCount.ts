import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const TOTAL_SLOTS = 100;

export const useEsekPaturCount = () => {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { count: c } = await supabase
        .from('esek_patur_applications')
        .select('*', { count: 'exact', head: true });
      setCount(c ?? 0);
    };
    fetch();
  }, []);

  const remaining = count !== null ? Math.max(0, TOTAL_SLOTS - count) : null;
  return { count, remaining, total: TOTAL_SLOTS };
};
