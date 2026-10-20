import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

/**
 * Waiting screen only. Session establishment is done by the Supabase client
 * and routing by OAuthReturnHandler — this page never navigates on its own, so
 * there are no competing redirects. On timeout it offers a retry instead of
 * silently dropping the user on the home page.
 */
const AuthCallbackPage = () => {
  const { user, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (user) return;
    const id = window.setTimeout(() => {
      console.warn('[auth] stage=callback status=timeout');
      setTimedOut(true);
    }, 15000);
    return () => window.clearTimeout(id);
  }, [user]);

  if (timedOut && !user && !loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-base text-foreground">Не удалось завершить вход. Ваша заявка сохранена — попробуйте ещё раз.</p>
        <Button asChild>
          <Link to="/login">Войти снова</Link>
        </Button>
      </div>
    );
  }

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
