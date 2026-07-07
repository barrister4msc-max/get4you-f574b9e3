import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { AGREEMENT_VERSION } from '@/lib/taskerAgreementText';

/**
 * Onboarding is "complete" when the tasker has at least one service category
 * AND a notification preferences row. No new columns/migrations required.
 */
export function useTaskerOnboardingStatus() {
  const { user } = useAuth();
  const { isTasker } = useActiveRole();
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState<boolean>(true);
  const [agreementSigned, setAgreementSigned] = useState<boolean>(true);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [signedVersion, setSignedVersion] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!user || !isTasker) {
      setComplete(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [catRes, prefRes, agrRes] = await Promise.all([
      (supabase.from('tasker_service_categories' as any) as any)
        .select('user_id', { head: true, count: 'exact' })
        .eq('user_id', user.id),
      (supabase.from('tasker_notification_preferences' as any) as any)
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle(),
      (supabase.from('tasker_agreements' as any) as any)
        .select('signed_at, agreement_version')
        .eq('user_id', user.id)
        .eq('agreement_version', AGREEMENT_VERSION)
        .order('signed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const hasCats = (catRes.count ?? 0) > 0;
    const hasPrefs = !!prefRes.data;
    const hasAgr = !!agrRes?.data;
    setAgreementSigned(hasAgr);
    setSignedAt(agrRes?.data ? (agrRes.data as any).signed_at ?? null : null);
    setSignedVersion(agrRes?.data ? (agrRes.data as any).agreement_version ?? null : null);
    setComplete(hasCats && hasPrefs && hasAgr);
    setLoading(false);
  }, [user, isTasker]);

  useEffect(() => { check(); }, [check]);

  return { loading, complete, isTasker, agreementSigned, signedAt, signedVersion, refresh: check };
}