import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveRole } from '@/contexts/ActiveRoleContext';

/**
 * Onboarding is "complete" when the tasker has at least one service category
 * AND a notification preferences row. No new columns/migrations required.
 */
export function useTaskerOnboardingStatus() {
  const { user } = useAuth();
  const { isTasker } = useActiveRole();
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState<boolean>(true);

  const check = useCallback(async () => {
    if (!user || !isTasker) {
      setComplete(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [catRes, prefRes] = await Promise.all([
      (supabase.from('tasker_service_categories' as any) as any)
        .select('user_id', { head: true, count: 'exact' })
        .eq('user_id', user.id),
      (supabase.from('tasker_notification_preferences' as any) as any)
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    const hasCats = (catRes.count ?? 0) > 0;
    const hasPrefs = !!prefRes.data;
    setComplete(hasCats && hasPrefs);
    setLoading(false);
  }, [user, isTasker]);

  useEffect(() => { check(); }, [check]);

  return { loading, complete, isTasker, refresh: check };
}