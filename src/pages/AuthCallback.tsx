import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { resolvePostAuthRedirect, consumePostAuthReturnTo } from '@/lib/postAuthRedirect';

const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const handledRef = useRef(false);
  const codeExchangedRef = useRef(false);

  useEffect(() => {
    console.log('[oauth-flow] AuthCallback mount', {
      url: window.location.href,
      hasHash: !!window.location.hash,
      hasCode: new URLSearchParams(window.location.search).has('code'),
      loading,
      hasUser: !!user,
    });

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const errorDesc = params.get('error_description') || params.get('error');

    if (errorDesc) {
      console.error('[oauth-flow] AuthCallback error in hash', errorDesc);
      window.sessionStorage.removeItem('oauth_return_to');
      try { window.sessionStorage.removeItem('oauth_pending'); } catch { /* noop */ }
      toast.error(errorDesc, { duration: 10000 });
      navigate('/', { replace: true });
      return;
    }

    // PKCE / magic-link: URL has `?code=...`. Exchange it explicitly (idempotent
    // guard). Supabase's detectSessionInUrl handles this too, but calling it
    // explicitly gives us a real error to log instead of a silent failure.
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    if (code && !codeExchangedRef.current) {
      codeExchangedRef.current = true;
      (async () => {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          console.log('[oauth-flow] exchangeCodeForSession result', {
            ok: !error,
            hasSession: !!data?.session,
            err: error?.message,
          });
          if (error) console.warn('[oauth-flow] code exchange failed', error);
          // Clean the ?code= param so a refresh doesn't retry.
          window.history.replaceState(null, '', window.location.pathname);
        } catch (e) {
          console.warn('[oauth-flow] exchangeCodeForSession threw', e);
        }
      })();
      return;
    }

    if (loading) return;
    if (handledRef.current) return;

    if (user) {
      handledRef.current = true;
      const sessionReturnTo = window.sessionStorage.getItem('oauth_return_to');
      window.sessionStorage.removeItem('oauth_return_to');
      try { window.sessionStorage.removeItem('oauth_pending'); } catch { /* noop */ }
      const storedReturnTo = consumePostAuthReturnTo();
      // Safety net: ensure profile + default role exist (e.g. Apple OAuth
      // without email, or trigger failure). Idempotent on the server.
      (async () => {
        try {
          const { error } = await supabase.rpc('ensure_profile');
          if (error) console.warn('[oauth-flow] ensure_profile failed', error);
        } catch (e) {
          console.warn('[oauth-flow] ensure_profile threw', e);
        }
        // Send welcome email for new OAuth users (idempotent on user.id).
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('created_at, display_name')
            .eq('user_id', user.id)
            .single();
          const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : 0;
          const isNew = createdAt && (Date.now() - createdAt) < 10 * 60 * 1000;
          if (isNew && user.email) {
            await supabase.functions.invoke('send-transactional-email', {
              body: {
                templateName: 'welcome',
                recipientEmail: user.email,
                idempotencyKey: `welcome-${user.id}`,
                templateData: {
                  name: profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
                },
              },
            });
          }
        } catch (e) {
          console.warn('[oauth-flow] welcome email send failed', e);
        }
        try {
          const returnToCandidate =
            (sessionReturnTo && sessionReturnTo !== '/create-task?continueDraft=1' ? sessionReturnTo : null) ||
            storedReturnTo ||
            null;
          const { path } = await resolvePostAuthRedirect(supabase, user.id, {
            returnTo: returnToCandidate,
          });
          console.log('[oauth-flow] AuthCallback navigate ->', path);
          navigate(path, { replace: true });
        } catch (e) {
          console.error('[oauth-flow] post-auth redirect failed, fallback /dashboard', e);
          navigate('/dashboard', { replace: true });
        }
      })();
      return;
    }

    // No user yet, no explicit error. Wait a bit for the Supabase client to
    // finish consuming any URL tokens; if still no session, send home (NOT to
    // /login) so the user isn't spammed with a login prompt after a valid
    // provider return.
    const timeoutId = window.setTimeout(() => {
      if (handledRef.current) return;
      handledRef.current = true;
      console.warn('[oauth-flow] AuthCallback timeout without session — fallback to /');
      window.sessionStorage.removeItem('oauth_return_to');
      try { window.sessionStorage.removeItem('oauth_pending'); } catch { /* noop */ }
      navigate('/', { replace: true });
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [user, loading, navigate]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span>Выполняем вход…</span>
      </div>
    </div>
  );
};

export default AuthCallbackPage;