import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { SupportDialog } from './SupportDialog';
import { useLanguage } from '@/i18n/LanguageContext';

export const Layout = () => {
  const { dir, locale } = useLanguage();
  const { pathname } = useLocation();
  return (
    <div className={`min-h-screen flex flex-col${pathname === '/' ? ' homepage' : ''}`} dir={dir} lang={locale}>
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <SupportDialog />
    </div>
  );
};
