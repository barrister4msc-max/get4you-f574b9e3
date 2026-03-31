import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Lock, User, ArrowRight, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';
import PasswordInput from '@/components/PasswordInput';
import { toast } from 'sonner';

type Role = 'client' | 'tasker' | 'both';

const getPasswordStrength = (pw: string): { level: 'weak' | 'medium' | 'strong'; score: number } => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 'weak', score: 1 };
  if (score <= 2) return { level: 'medium', score: 2 };
  return { level: 'strong', score: 3 };
};

const LoginPage = () => {
  const { t } = useLanguage();
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isSignupRoute = location.pathname === '/signup';
  const initialTab = isSignupRoute || searchParams.get('tab') === 'signup' ? 'signup' : 'login';

  const [tab, setTab] = useState<'login' | 'signup'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('client');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Post-signup state
  const [signupComplete, setSignupComplete] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [resending, setResending] = useState(false);

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const hasMinLength = password.length >= 8;
  const hasLettersAndDigits = /[a-zA-Z]/.test(password) && /[0-9]/.test(password);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      const returnTo = searchParams.get('returnTo');
      navigate(returnTo || '/');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t('auth.passwordMin'));
      return;
    }
    if (!hasLettersAndDigits) {
      toast.error(t('auth.passwordRequireLettersDigits'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, name, role);
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      setSignupEmail(email);
      setSignupComplete(true);
    }
  };

  const handleResendEmail = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: signupEmail,
    });
    setResending(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('auth.emailResent'));
    }
  };

  const roles: { value: Role; label: string }[] = [
    { value: 'client', label: t('auth.role.client') },
    { value: 'tasker', label: t('auth.role.tasker') },
    { value: 'both', label: t('auth.role.both') },
  ];

  const strengthColors = {
    weak: 'bg-destructive',
    medium: 'bg-accent',
    strong: 'bg-primary',
  };

  const strengthLabels = {
    weak: t('auth.strength.weak'),
    medium: t('auth.strength.medium'),
    strong: t('auth.strength.strong'),
  };

  // Post-signup confirmation screen
  if (signupComplete) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12">
        <div className="w-full max-w-md mx-auto px-4 text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">🎉 {t('auth.welcome.title')}</h1>
          <p className="text-muted-foreground mb-1">
            {t('auth.checkEmailDesc')} <span className="font-semibold text-foreground">{signupEmail}</span>
          </p>

          <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/20 text-start space-y-2">
            <p className="text-sm font-semibold text-foreground">{t('auth.welcome.nextSteps')}</p>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold text-sm">1.</span>
              <p className="text-sm text-muted-foreground">{t('auth.welcome.step1')}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold text-sm">2.</span>
              <p className="text-sm text-muted-foreground">{t('auth.welcome.step2')}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold text-sm">3.</span>
              <p className="text-sm text-muted-foreground">{t('auth.welcome.step3')}</p>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-accent/10 border border-accent/30 flex items-start gap-3 text-start">
            <AlertTriangle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              {t('auth.checkSpam')}
            </p>
          </div>

          <button
            onClick={handleResendEmail}
            disabled={resending}
            className="mt-5 flex items-center justify-center gap-2 mx-auto px-6 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
            {t('auth.resendEmail')}
          </button>

          <button
            onClick={() => {
              setSignupComplete(false);
              setTab('login');
              setPassword('');
              setConfirmPassword('');
            }}
            className="mt-4 text-sm text-primary font-medium hover:underline"
          >
            {t('auth.backToLogin')}
          </button>
        </div>
      </div>
    );
  }


  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setForgotSent(true);
    }
  };

  if (forgotMode) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12">
        <div className="w-full max-w-md mx-auto px-4">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-emerald flex items-center justify-center mx-auto mb-4">
              <Mail className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">{t('auth.forgotTitle')}</h1>
            <p className="text-muted-foreground text-sm mt-2">{t('auth.forgotDesc')}</p>
          </div>

          {forgotSent ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <p className="text-muted-foreground mb-2">{t('auth.forgotSent')}</p>
              <p className="font-semibold text-foreground">{forgotEmail}</p>
              <div className="mt-6 p-4 rounded-xl bg-accent/10 border border-accent/30 flex items-start gap-3 text-start">
                <AlertTriangle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">{t('auth.checkSpam')}</p>
              </div>
              <button
                onClick={() => { setForgotMode(false); setForgotSent(false); }}
                className="mt-6 text-sm text-primary font-medium hover:underline"
              >
                {t('auth.backToLogin')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('auth.email')}</label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {forgotLoading ? '...' : t('auth.forgotSubmit')}
                {!forgotLoading && <ArrowRight className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setForgotMode(false)}
                className="w-full text-sm text-primary font-medium hover:underline"
              >
                {t('auth.backToLogin')}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-emerald flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-lg">T</span>
          </div>
          <h1 className="text-2xl font-bold">{t('nav.account')}</h1>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-muted p-1 mb-6">
          <button
            type="button"
            onClick={() => setTab('login')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === 'login' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t('auth.login')}
          </button>
          <button
            type="button"
            onClick={() => setTab('signup')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === 'signup' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t('auth.signup')}
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.email')}</label>
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.password')}</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                show={showLoginPassword}
                onToggle={() => setShowLoginPassword(!showLoginPassword)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? '...' : t('auth.login')}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setForgotMode(true)}
              className="w-full text-sm text-primary font-medium hover:underline"
            >
              {t('auth.forgot')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.name')}</label>
              <div className="relative">
                <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.email')}</label>
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.password')}</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                minLength={8}
              />

              {/* Password requirements */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className={`w-3.5 h-3.5 ${hasMinLength ? 'text-primary' : 'text-muted-foreground/40'}`} />
                    <span className={hasMinLength ? 'text-foreground' : 'text-muted-foreground'}>{t('auth.req.minLength')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className={`w-3.5 h-3.5 ${hasLettersAndDigits ? 'text-primary' : 'text-muted-foreground/40'}`} />
                    <span className={hasLettersAndDigits ? 'text-foreground' : 'text-muted-foreground'}>{t('auth.req.lettersDigits')}</span>
                  </div>

                  {/* Strength indicator */}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i <= strength.score ? strengthColors[strength.level] : 'bg-border'
                          }`}
                        />
                      ))}
                    </div>
                    <span className={`text-xs font-medium ${
                      strength.level === 'weak' ? 'text-destructive' :
                      strength.level === 'medium' ? 'text-accent-foreground' : 'text-primary'
                    }`}>
                      {strengthLabels[strength.level]}
                    </span>
                  </div>
                </div>
              )}
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

            <div>
              <label className="block text-sm font-medium mb-2">{t('auth.role')}</label>
              <div className="grid grid-cols-3 gap-2">
                {roles.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                      role === r.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {role === r.value && <CheckCircle2 className="w-3 h-3 inline me-1" />}
                    {r.label}
                  </button>
                ))}
              </div>
              {(role === 'tasker' || role === 'both') && (
                <div className="mt-2 p-3 rounded-xl bg-primary/10 border border-primary/30 text-center">
                  <p className="text-xs font-semibold text-primary">{t('esek.promo.title')}</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !hasMinLength || !hasLettersAndDigits}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? '...' : t('auth.signup')}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
