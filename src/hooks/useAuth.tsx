import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  city: string | null;
  preferred_currency: string | null;
  preferred_language: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: string[];
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signUp: (email: string, password: string, name: string, role: 'client' | 'tasker' | 'both') => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    setProfile(data);

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    setRoles(rolesData?.map(r => r.role) ?? []);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    const finishLoading = () => {
      if (!settled) {
        settled = true;
        setLoading(false);
      }
    };

    // Safety net: never get stuck on white screen (iOS Safari / Apple OAuth race)
    const safetyTimer = window.setTimeout(finishLoading, 4000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Defer to avoid deadlocks inside the auth callback
        setTimeout(() => {
          if (!cancelled) fetchProfile(session.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
      finishLoading();
    });

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (cancelled) return;
        if (session?.user) {
          try {
            const { data: banned } = await supabase.rpc('is_user_banned', { _user_id: session.user.id });
            if (banned) {
              await supabase.auth.signOut();
              finishLoading();
              return;
            }
          } catch (e) {
            // Ignore ban-check failure; don't block login
            console.warn('[auth] is_user_banned check failed', e);
          }
        }
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id).finally(finishLoading);
          supabase
            .from('profiles')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('user_id', session.user.id)
            .then(() => {});
        } else {
          finishLoading();
        }
      })
      .catch((e) => {
        console.error('[auth] getSession failed', e);
        finishLoading();
      });

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const isSuperAdmin = roles.includes('super_admin') || roles.includes('superadmin');
  const isAdmin = isSuperAdmin || roles.includes('admin');

  const signUp = async (email: string, password: string, name: string, role: 'client' | 'tasker' | 'both') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name, role },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      const { data: banned } = await supabase.rpc('is_user_banned', { _user_id: data.user.id });
      if (banned) {
        await supabase.auth.signOut();
        return { error: 'Ваш аккаунт заблокирован администратором. Обратитесь в поддержку.' };
      }
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, isAdmin, isSuperAdmin, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
