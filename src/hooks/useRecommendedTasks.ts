import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface RecommendedTask {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  category_name_en: string | null;
  category_name_ru: string | null;
  category_name_he: string | null;
  city: string | null;
  budget_fixed: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  status: string;
  task_type: string | null;
  is_urgent: boolean | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  photos: string[] | null;
  score: number;
  distance_km: number | null;
}

interface Options {
  userLat?: number | null;
  userLng?: number | null;
  radiusKm?: number | null;
  limit?: number;
  enabled?: boolean;
}

/**
 * Unified recommended-tasks hook. Used on Home, Dashboard and /tasks
 * to guarantee consistent ordering by skill/category/distance/recency.
 */
export function useRecommendedTasks(opts: Options = {}) {
  const { user } = useAuth();
  const { userLat = null, userLng = null, radiusKm = null, limit = 50, enabled = true } = opts;
  const [tasks, setTasks] = useState<RecommendedTask[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !user) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('get_recommended_tasks' as never, {
        _user_id: user.id,
        _user_lat: userLat,
        _user_lng: userLng,
        _radius_km: radiusKm,
        _result_limit: limit,
      } as never);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setTasks([]);
      } else {
        setTasks((data as unknown as RecommendedTask[]) || []);
      }
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [user?.id, userLat, userLng, radiusKm, limit, enabled]);

  return { tasks, loading, error };
}
