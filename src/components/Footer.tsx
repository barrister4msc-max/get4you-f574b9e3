import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';

export const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="container py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-emerald flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs">T</span>
            </div>
            <span className="font-semibold text-foreground">TaskFlow</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground transition-colors">{t('footer.terms')}</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">{t('footer.privacy')}</Link>
            <span className="hover:text-foreground transition-colors cursor-pointer">{t('footer.support')}</span>
          </div>
          <p className="text-xs text-muted-foreground"><p className="text-xs text-muted-foreground">© 2026 Hooppy production Ltd. {t('footer.rights')}</p></p>
        </div>
      </div>
    </footer>
  );
};
