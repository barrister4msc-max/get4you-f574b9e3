import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { resolvePostAuthRedirect, consumePostAuthReturnTo } from '@/lib/postAuthRedirect';

/**
 * Mounted inside the router. Handles the completion of any OAuth (Google/Apple)
 * flow that was initiated via lovable.auth.signInWithOAuth with a full-page
 * redirect. The broker returns to `window.location.origin` (or /auth/callback)
 * with tokens in the URL hash. `@supabase/supabase-js` auto-consumes them
 * (detectSessionInUrl=true) and fires SIGNED_IN.
 *
 * This component:
 *  - Reports OAuth errors returned in the URL fragment as a friendly toast
 *    (instead of Supabase's raw "failed to sign in with vendor").
 *  - When an OAuth attempt is in flight (`oauth_pending` marker) and the user
 *    is signed in, routes them via the unified postAuth resolver.
 *  - Uses a ref guard so it never runs twice.
 */
export const OAuthReturnHandler = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handledRef = useRef(false);
  const errorReportedRef = useRef(false);
  const diagLoggedRef = useRef(false);
  const codeExchangedRef = useRef(false);

  // One-time diagnostic dump on mount so we can see exactly what came back
  // from the OAuth provider even when no `error` param is present.
  useEffect(() => {
    if (diagLoggedRef.current) return;
    diagLoggedRef.current = true;
    try {
      const href = window.location.href;
      const hash = window.location.hash;
      const search = window.location.search;
      const hashParams = hash && hash.length > 1
        ? Object.fromEntries(new URLSearchParams(hash.replace('#', '?')))
        : {};
      const searchParams = search
        ? Object.fromEntries(new URLSearchParams(search))
        : {};
      console.log('[oauth-flow] OAuthReturnHandler mount', {
        href, hash, search, hashParams, searchParams,
        oauth_pending: (() => { try { return window.sessionStorage.getItem('oauth_pending'); } catch { return null; } })(),
        oauth_return_to: (() => { try { return window.sessionStorage.getItem('oauth_return_to'); } catch { return null; } })(),
      });
      // Async dumps of the current session/user for post-return diagnostics.
      supabase.auth.getSession().then(({ data, error }) => {
        console.log('[oauth-flow] getSession()', {
          hasSession: !!data?.session,
          userId: data?.session?.user?.id,
          expires_at: data?.session?.expires_at,
          error,
        });
      }).catch((e) => console.error('[oauth-flow] getSession threw', e));
      supabase.auth.getUser().then(({ data, error }) => {
        console.log('[oauth-flow] getUser()', {
          userId: data?.user?.id,
          email: data?.user?.email,
          error,
        });
      }).catch((e) => console.error('[oauth-flow] getUser threw', e));
    } catch (e) {
      console.error('[oauth-flow] mount diagnostics failed', e);
    }
  }, []);

  // The managed OAuth broker can return to the bare origin with a PKCE
  // `?code=...` instead of `/auth/callback`. Exchange it here too so Google
  // and Apple share one robust callback path.
  useEffect(() => {
    if (codeExchangedRef.current) return;
    const searchParams = new URLSearchParams(window.location.search || '');
    const code = searchParams.get('code');
    if (!code) return;
    codeExchangedRef.current = true;
    console.log('[oauth-flow] OAuthReturnHandler found code on origin callback', {
      path: location.pathname,
      hasCode: true,
      oauth_pending: (() => { try { return window.sessionStorage.getItem('oauth_pending'); } catch { return null; } })(),
    });
    (async () => {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        console.log('[oauth-flow] origin exchangeCodeForSession result', {
          ok: !error,
          hasSession: !!data?.session,
          userId: data?.session?.user?.id,
          err: error?.message,
          error,
        });
        if (error) {
          toast.error(error.message, { duration: 10000 });
        }
      } catch (e) {
        console.error('[oauth-flow] origin exchangeCodeForSession threw', e);
        toast.error(e instanceof Error ? e.message : String(e), { duration: 10000 });
      } finally {
        searchParams.delete('code');
        const cleanSearch = searchParams.toString();
        window.history.replaceState(null, '', location.pathname + (cleanSearch ? `?${cleanSearch}` : ''));
      }
    })();
  }, [location.pathname]);

  // Report OAuth errors from the URL fragment ASAP (independent of session).
  useEffect(() => {
    if (errorReportedRef.current) return;
    try {
      const hash = window.location.hash;
      const search = window.location.search;
      const hashParams = hash && hash.length > 1
        ? new URLSearchParams(hash.replace('#', '?'))
        : new URLSearchParams();
      const searchParams = new URLSearchParams(search || '');
      const err = hashParams.get('error') || searchParams.get('error');
      const desc = hashParams.get('error_description') || searchParams.get('error_description');
      const code = hashParams.get('error_code') || searchParams.get('error_code');
      if (!err && !desc) return;
      errorReportedRef.current = true;
      console.error('[oauth-flow] provider error', {
        error: err,
        error_code: code,
        error_description: desc,
        path: location.pathname,
        hash,
        search,
        hashParams: Object.fromEntries(hashParams),
        searchParams: Object.fromEntries(searchParams),
      });
      // TEMPORARY: surface the raw provider message so we can see the real
      // cause instead of the generic Russian fallback. Remove after root cause
      // is fixed.
      const raw = desc || err || 'OAuth error';
      const shown = code ? `${code}: ${raw}` : raw;
      toast.error(shown, { duration: 10000 });
      try { window.sessionStorage.removeItem('oauth_pending'); } catch { /* noop */ }
      try { window.sessionStorage.removeItem('oauth_return_to'); } catch { /* noop */ }
      // Clean the hash so the toast doesn't re-fire on next navigation.
      window.history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
      console.warn('[oauth-flow] error-parse failed', e);
    }
  }, [location.pathname, location.search]);

  // On successful sign-in after an OAuth attempt, route via unified resolver.
  useEffect(() => {
    if (handledRef.current) return;
    if (loading) return;
    if (!user) return;
    let pending: string | null = null;
    try { pending = window.sessionStorage.getItem('oauth_pending'); } catch { /* noop */ }
    if (!pending) return;
    handledRef.current = true;
    console.log('[oauth-flow] SIGNED_IN after OAuth', { provider: pending, userId: user.id });
    try { window.sessionStorage.removeItem('oauth_pending'); } catch { /* noop */ }
    let sessionReturnTo: string | null = null;
    try { sessionReturnTo = window.sessionStorage.getItem('oauth_return_to'); } catch { /* noop */ }
    try { window.sessionStorage.removeItem('oauth_return_to'); } catch { /* noop */ }
    const storedReturnTo = consumePostAuthReturnTo();

    (async () => {
      try {
        const { error } = await supabase.rpc('ensure_profile');
        if (error) console.warn('[oauth-flow] ensure_profile failed', error);
      } catch (e) {
        console.warn('[oauth-flow] ensure_profile threw', e);
      }
      try {
        const returnTo = sessionReturnTo || storedReturnTo || null;
        const { path } = await resolvePostAuthRedirect(supabase, user.id, { returnTo });
        console.log('[oauth-flow] navigate ->', path);
        navigate(path, { replace: true });
      } catch (e) {
        console.error('[oauth-flow] postAuthRedirect failed, fallback /dashboard', e);
        navigate('/dashboard', { replace: true });
      }
    })();
  }, [user, loading, navigate]);

  return null;
};

export default OAuthReturnHandler;