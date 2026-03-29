import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { CurrencyToggle } from './CurrencyToggle';
import { Menu, X, User } from 'lucide-react';
import { useState } from 'react';

export const Header = () => {
  const { t } = useLanguage();
  const { user, profile, roles } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isTaskerOnly = user && roles.length > 0 && roles.every(r => r === 'tasker');
  const isAdmin = user && roles.includes('admin');

  const navLinks = [
    { to: '/', label: t('nav.home') },
    { to: '/tasks', label: t('nav.tasks') },
    ...(!isTaskerOnly ? [{ to: '/create-task', label: t('nav.create') }] : []),
    { to: '/how-it-works', label: t('nav.howItWorks') },
    { to: '/for-taskers', label: t('nav.forTaskers') },
    ...(isAdmin ? [{ to: '/admin/esek-patur', label: t('nav.admin') }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(152, 55%, 42%), hsl(45, 95%, 55%))' }}>
            <span className="text-primary-foreground font-bold text-sm">T</span>
          </div>
          <span className="font-bold text-lg text-gradient-emerald">TaskFlow</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === link.to
                  ? 'text-primary bg-emerald-50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <CurrencyToggle />
          <LanguageSwitcher />
          {user ? (
            <Link
              to="/profile"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
            >
              <User className="w-4 h-4" />
              {profile?.display_name || t('nav.profile')}
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary rounded-lg transition-colors"
              >
                {t('nav.login')}
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
              >
                {t('nav.signup')}
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 pb-4">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className="block py-3 text-sm font-medium text-foreground border-b border-border/50"
            >
              {link.label}
            </Link>
          ))}
          <div className="flex items-center gap-2 pt-3">
            <CurrencyToggle />
            <LanguageSwitcher />
          </div>
          <div className="flex gap-2 pt-3">
            {user ? (
              <Link to="/profile" onClick={() => setMobileOpen(false)} className="flex-1 text-center py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground">
                {t('nav.profile')}
              </Link>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileOpen(false)} className="flex-1 text-center py-2 text-sm font-medium border border-border rounded-lg">
                  {t('nav.login')}
                </Link>
                <Link to="/signup" onClick={() => setMobileOpen(false)} className="flex-1 text-center py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground">
                  {t('nav.signup')}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
