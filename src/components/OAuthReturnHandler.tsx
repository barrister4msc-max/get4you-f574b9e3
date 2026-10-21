import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { resolvePostAuthRedirect, consumePostAuthReturnTo } from '@/lib/postAuthRedirect';

/**
 * The ONLY owner of post-auth routing (Google, Apple, email confirmation).
 *
 * Protocol (verified in @lovable.dev/cloud-auth-js): the managed broker either
 * posts tokens back to the opener (popup / preview iframe; the lovable wrapper
 * calls setSession) or, for full-page flow, returns to `redirect_uri` with
 * Supabase tokens in the URL hash, which the Supabase client consumes itself
 * (detectSessionInUrl). A `?code=` on our origin is NOT a Supabase PKCE code
 * (the client uses the implicit flow), so it is never exchanged here.
 *
 * Diagnostics log only the stage and error code — never URLs, tokens, codes or
 * personal data.
 */
const ss = {
  get: (k: string) => { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  del: (k: string) => { try { window.sessionStorage.removeItem(k); } catch { /* noop */ } },
};

export const OAuthReturnHandler = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handledRef = useRef(false);
  const errorReportedRef = useRef(false);

  // Provider / broker error returned in the URL.
  useEffect(() => {
    if (errorReportedRef.current) return;
    const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search || '');
    const err = hashParams.get('error') || searchParams.get('error');
    const desc = hashParams.get('error_description') || searchParams.get('error_description');
    const code = hashParams.get('error_code') || searchParams.get('error_code');
    if (!err && !desc) return;
    errorReportedRef.current = true;
    console.warn('[auth] stage=provider_return status=error', { error: err, error_code: code });
    ss.del('oauth_pending');
    ss.del('oauth_return_to');
    toast.error(desc || err || 'Sign-in failed', { duration: 10000 });
    window.history.replaceState(null, '', location.pathname);
    // Return to the login page so the user can retry; the draft stays in storage.
    navigate('/login', { replace: true });
  }, [location.pathname, navigate]);

  // Allow the next sign-in in this tab to be routed after a sign-out.
  useEffect(() => {
    if (!loading && !user) handledRef.current = false;
  }, [user, loading]);

  // Route once the session is established after an auth flow
  // (Google/Apple: oauth_pending; email login/signup: oauth_pending='email';
  // email confirmation link: /auth/callback).
  useEffect(() => {
    if (handledRef.current || loading || !user) return;
    const pending = ss.get('oauth_pending');
    const onCallback = location.pathname === '/auth/callback';
    if (!pending && !onCallback) return;
    handledRef.current = true;
    console.info('[auth] stage=session_ready', { provider: pending || 'email' });
    ss.del('oauth_pending');
    const sessionReturnTo = ss.get('oauth_return_to');
    ss.del('oauth_return_to');

    (async () => {
      try {
        const { error } = await supabase.rpc('ensure_profile');
        if (error) console.warn('[auth] stage=ensure_profile status=error', { code: error.code });
      } catch {
        console.warn('[auth] stage=ensure_profile status=threw');
      }
      try {
        const { path } = await resolvePostAuthRedirect(supabase, user.id, { returnTo: sessionReturnTo || null });
        navigate(path, { replace: true });
      } catch {
        console.warn('[auth] stage=redirect status=error');
        consumePostAuthReturnTo();
        navigate('/dashboard', { replace: true });
      }
      // Welcome email for new accounts — after routing, never delaying it.
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('created_at, display_name')
          .eq('user_id', user.id)
          .maybeSingle();
        const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : 0;
        if (createdAt && Date.now() - createdAt < 10 * 60 * 1000 && user.email) {
          await supabase.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'welcome',
              recipientEmail: user.email,
              idempotencyKey: `welcome-${user.id}`,
              templateData: { name: profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || '' },
            },
          });
        }
      } catch {
        console.warn('[auth] stage=welcome_email status=error');
      }
    })();
  }, [user, loading, navigate, location.pathname]);

  return null;
};

export default OAuthReturnHandler;
