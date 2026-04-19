import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const FALLBACK_RETURN_TO = '/dashboard';

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
      const returnTo = window.sessionStorage.getItem('oauth_return_to') || FALLBACK_RETURN_TO;
      window.sessionStorage.removeItem('oauth_return_to');
      navigate(returnTo, { replace: true });
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