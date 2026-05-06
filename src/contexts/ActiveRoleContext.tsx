import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export type ActiveRole = 'client' | 'tasker';
const STORAGE_KEY = 'dashboard_active_role';

interface ActiveRoleContextValue {
  activeRole: ActiveRole;
  setActiveRole: (r: ActiveRole) => void;
  isClient: boolean;
  isTasker: boolean;
  hasBothRoles: boolean;
}

const ActiveRoleContext = createContext<ActiveRoleContextValue | null>(null);

export const ActiveRoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { roles, profile, user, refreshProfile } = useAuth();

  const isClient = roles.includes('client');
  const isTasker = roles.includes('executor') || roles.includes('tasker');
  const hasBothRoles = isClient && isTasker;
  const defaultRole: ActiveRole = isTasker && !isClient ? 'tasker' : 'client';

  const [activeRole, setActiveRoleState] = useState<ActiveRole>(() => {
    if (typeof window === 'undefined') return defaultRole;
    const stored = window.localStorage.getItem(STORAGE_KEY) as ActiveRole | null;
    if (stored === 'client' || stored === 'tasker') return stored;
    return defaultRole;
  });

  // Primary source: profile.active_role (DB). Fallback: localStorage / default.
  // Internally `executor` is the canonical worker role; map to UI's `tasker`
  // alias to keep older components working.
  useEffect(() => {
    const dbRole = (profile as any)?.active_role as string | null | undefined;
    if (dbRole === 'client' || dbRole === 'executor') {
      const uiRole: ActiveRole = dbRole === 'executor' ? 'tasker' : 'client';
      setActiveRoleState(uiRole);
      try { window.localStorage.setItem(STORAGE_KEY, uiRole); } catch {}
    }
  }, [profile]);

  // Sync if user only has one role
  useEffect(() => {
    if (!hasBothRoles) setActiveRoleState(defaultRole);
  }, [hasBothRoles, defaultRole]);

  // Listen to cross-component changes (storage events fire across tabs/windows)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'client' || e.newValue === 'tasker')) {
        setActiveRoleState(e.newValue);
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === 'client' || detail === 'tasker') setActiveRoleState(detail);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('active-role-changed', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('active-role-changed', onCustom as EventListener);
    };
  }, []);

  const setActiveRole = (r: ActiveRole) => {
    setActiveRoleState(r);
    try {
      window.localStorage.setItem(STORAGE_KEY, r);
      window.dispatchEvent(new CustomEvent('active-role-changed', { detail: r }));
    } catch {}
    // Persist to profiles.active_role (canonical: executor, not tasker)
    if (user) {
      const dbRole = r === 'tasker' ? 'executor' : 'client';
      supabase
        .from('profiles')
        .update({ active_role: dbRole as never })
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (!error) refreshProfile();
        });
    }
  };

  const value = useMemo(
    () => ({ activeRole, setActiveRole, isClient, isTasker, hasBothRoles }),
    [activeRole, isClient, isTasker, hasBothRoles],
  );

  return <ActiveRoleContext.Provider value={value}>{children}</ActiveRoleContext.Provider>;
};

export const useActiveRole = () => {
  const ctx = useContext(ActiveRoleContext);
  if (!ctx) throw new Error('useActiveRole must be used within ActiveRoleProvider');
  return ctx;
};
