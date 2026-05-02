import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { SupportDialog } from './SupportDialog';
import { Headphones } from 'lucide-react';

export const Footer = () => {
  const { t } = useLanguage();
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="container py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(152, 55%, 42%), hsl(45, 95%, 55%))' }}>
              <span className="text-primary-foreground font-bold text-xs">4</span>
            </div>
            <span className="font-semibold text-gradient-emerald">4You</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground transition-colors">{t('footer.terms')}</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">{t('footer.privacy')}</Link>
            <button
              onClick={() => setSupportOpen(true)}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Headphones className="w-3.5 h-3.5" />
              {t('footer.support')}
            </button>
          </div>
          <div className="text-xs text-muted-foreground text-center md:text-right space-y-0.5">
            <p>© 2026 Hooppy production Ltd. {t('footer.rights')}</p>
            <p>{t('footer.tel')} 538074330 · {t('footer.address')} · email: <a href="mailto:get4you28@gmail.com" className="hover:text-foreground transition-colors">get4you28@gmail.com</a></p>
          </div>
        </div>
      </div>

      <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} showFab={false} />
    </footer>
  );
};
