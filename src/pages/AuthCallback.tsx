import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { resolvePostAuthRedirect, consumePostAuthReturnTo } from '@/lib/postAuthRedirect';

const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const errorDesc = params.get('error_description') || params.get('error');

    if (errorDesc) {
      window.sessionStorage.removeItem('oauth_return_to');
      toast.error(errorDesc.includes('initial state')
        ? 'Ошибка авторизации. Попробуйте другой браузер или отключите блокировку трекеров.'
        : errorDesc);
      navigate('/login', { replace: true });
      return;
    }

    if (loading) return;

    if (user) {
      const sessionReturnTo = window.sessionStorage.getItem('oauth_return_to');
      window.sessionStorage.removeItem('oauth_return_to');
      const storedReturnTo = consumePostAuthReturnTo();
      // Safety net: ensure profile + default role exist (e.g. Apple OAuth
      // without email, or trigger failure). Idempotent on the server.
      (async () => {
        try {
          const { error } = await supabase.rpc('ensure_profile');
          if (error) console.warn('[auth] ensure_profile failed', error);
        } catch (e) {
          console.warn('[auth] ensure_profile threw', e);
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
          console.warn('[auth] welcome email send failed', e);
        }
        try {
          const returnToCandidate =
            (sessionReturnTo && sessionReturnTo !== '/create-task?continueDraft=1' ? sessionReturnTo : null) ||
            storedReturnTo ||
            null;
          const { path } = await resolvePostAuthRedirect(supabase, user.id, {
            returnTo: returnToCandidate,
          });
          navigate(path, { replace: true });
        } catch (e) {
          console.error('[auth] post-auth redirect failed', e);
          navigate('/dashboard', { replace: true });
        }
      })();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      window.sessionStorage.removeItem('oauth_return_to');
      navigate('/login', { replace: true });
    }, 1500);

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