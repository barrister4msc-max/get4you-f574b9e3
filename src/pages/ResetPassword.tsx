import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import PasswordInput from '@/components/PasswordInput';

const ResetPassword = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Check for recovery token in URL hash
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t('auth.passwordMin'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('auth.resetSuccess'));
      navigate('/');
    }
  };

  if (!isRecovery) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12">
        <div className="w-full max-w-md mx-auto px-4 text-center">
          <p className="text-muted-foreground">{t('auth.resetInvalidLink')}</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 text-sm text-primary font-medium hover:underline"
          >
            {t('auth.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-emerald flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">{t('auth.resetTitle')}</h1>
          <p className="text-muted-foreground text-sm mt-2">{t('auth.resetDesc')}</p>
        </div>

        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('auth.newPassword')}</label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('auth.confirmPassword')}</label>
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirmPassword}
              onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
              minLength={8}
            />
          </div>

          <button
            type="submit"
            disabled={loading || password.length < 8}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? '...' : t('auth.resetSubmit')}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
