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

  // Report OAuth errors from the URL fragment ASAP (independent of session).
  useEffect(() => {
    if (errorReportedRef.current) return;
    try {
      const hash = window.location.hash;
      if (!hash || hash.length < 2) return;
      const params = new URLSearchParams(hash.replace('#', '?'));
      const err = params.get('error');
      const desc = params.get('error_description');
      if (!err && !desc) return;
      errorReportedRef.current = true;
      console.error('[oauth-flow] provider error', { err, desc, path: location.pathname });
      const raw = desc || err || 'OAuth error';
      let msg = raw;
      if (/vendor|provider/i.test(raw)) {
        msg = 'Не удалось войти через провайдера. Попробуйте ещё раз или используйте email/пароль.';
      } else if (/access_denied/i.test(raw)) {
        msg = 'Вход отменён.';
      } else if (/initial state/i.test(raw)) {
        msg = 'Ошибка авторизации. Попробуйте другой браузер или отключите блокировку трекеров.';
      }
      toast.error(msg);
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