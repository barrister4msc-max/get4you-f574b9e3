import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { CurrencyToggle } from './CurrencyToggle';
import { NotificationBell } from './NotificationBell';
import { Sheet, SheetContent, SheetTitle } from './ui/sheet';
import { Menu, User, LayoutDashboard, LogOut } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export const Header = () => {
  const { t, locale, setLocale } = useLanguage();
  const { user, profile, roles, signOut } = useAuth();
  const { activeRole, isClient, isTasker } = useActiveRole();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const nextLocale = locale === 'en' ? 'ru' : locale === 'ru' ? 'he' : locale === 'he' ? 'ar' : 'en';
  const localeLabels = { en: 'English', ru: 'Русский', he: 'עברית', ar: 'العربية' } as const;

  // Hide "Create task" when user is in tasker mode (or has only tasker role)
  const canCreateTask = !user || (isClient && activeRole === 'client') || (isClient && !isTasker);
  const isAdmin = user && (roles.includes('admin') || roles.includes('super_admin') || roles.includes('superadmin'));

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setDropdownOpen(false);
    await signOut();
    navigate('/');
  };

  const navLinks = [
    { to: '/', label: t('nav.home') },
    { to: '/tasks', label: t('nav.tasks') },
    ...(canCreateTask ? [{ to: '/create-task', label: t('nav.create') }] : []),
    { to: '/how-it-works', label: t('nav.howItWorks') },
    { to: '/for-taskers', label: t('nav.forTaskers') },
    ...(isAdmin ? [{ to: '/admin', label: t('nav.admin') }] : []),
  ];

  const ProfileDropdown = () => (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="shrink-0 focus:outline-none"
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-border hover:border-primary transition-colors cursor-pointer" />
        ) : (
          <span className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity cursor-pointer">
            <User className="w-4 h-4" />
            {profile?.display_name || t('nav.profile')}
          </span>
        )}
      </button>
      {dropdownOpen && (
        <div className="absolute end-0 mt-2 w-48 rounded-xl border border-border bg-card shadow-lg py-1 z-50">
          <Link
            to="/profile"
            onClick={() => setDropdownOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
          >
            <User className="w-4 h-4" />
            {t('nav.profile')}
          </Link>
          <Link
            to="/dashboard"
            onClick={() => setDropdownOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            {t('nav.dashboard')}
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              {t('admin.panel')}
            </Link>
          )}
          <div className="border-t border-border my-1" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-secondary transition-colors w-full text-start"
          >
            <LogOut className="w-4 h-4" />
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );

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
          <NotificationBell />
          {user ? (
            <ProfileDropdown />
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
            >
              <User className="w-4 h-4" />
              {t('nav.account')}
            </Link>
          )}
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <button
            type="button"
            aria-label="Open navigation menu"
            className="md:hidden p-2"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <SheetContent side="right" className="md:hidden w-[86vw] max-w-sm border-border bg-card px-0">
            <SheetTitle className="sr-only">Mobile navigation</SheetTitle>
            <div className="flex h-full flex-col pt-8">
              <div className="border-b border-border px-4 pb-4">
                <Link to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(152, 55%, 42%), hsl(45, 95%, 55%))' }}>
                    <span className="text-primary-foreground font-bold text-sm">T</span>
                  </div>
                  <span className="font-bold text-lg text-gradient-emerald">TaskFlow</span>
                </Link>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-6">
                <div className="space-y-1 py-4">
                  {navLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMobileOpen(false)}
                      className="block rounded-lg px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

                 <div className="border-t border-border pt-4">
                   <div className="flex items-center gap-2">
                     <CurrencyToggle />
                     <button
                       type="button"
                       onClick={() => setLocale(nextLocale)}
                       className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                     >
                       {localeLabels[locale]}
                     </button>
                   </div>
                 </div>

                <div className="pt-4 space-y-2">
                  {user ? (
                    <>
                      <Link to="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 w-full py-2.5 px-4 text-sm font-medium rounded-lg hover:bg-secondary transition-colors">
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                        {t('nav.profile')}
                      </Link>
                      <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 w-full py-2.5 px-4 text-sm font-medium rounded-lg hover:bg-secondary transition-colors">
                        <LayoutDashboard className="w-4 h-4" />
                        {t('nav.dashboard')}
                      </Link>
                      <button
                        type="button"
                        onClick={() => { setMobileOpen(false); void handleLogout(); }}
                        className="flex items-center gap-2 w-full py-2.5 px-4 text-sm font-medium rounded-lg text-destructive hover:bg-secondary transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        {t('nav.logout')}
                      </button>
                    </>
                  ) : (
                    <Link to="/login" onClick={() => setMobileOpen(false)} className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold rounded-lg bg-accent text-accent-foreground">
                      <User className="w-4 h-4" />
                      {t('nav.account')}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};
