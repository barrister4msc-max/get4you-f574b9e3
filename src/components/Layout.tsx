import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { SupportDialog } from './SupportDialog';
import { useLanguage } from '@/i18n/LanguageContext';

export const Layout = () => {
  const { dir, locale } = useLanguage();
  return (
    <div className="min-h-screen flex flex-col" dir={dir} lang={locale}>
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <SupportDialog />
    </div>
  );
};
