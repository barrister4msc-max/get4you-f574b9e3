import { useLanguage } from '@/i18n/LanguageContext';
import { LegalDocManager } from '@/components/LegalDocManager';

const TermsPage = () => {
  const { t } = useLanguage();
  return <LegalDocManager folder="terms" title={t('terms.title')} />;
};

export default TermsPage;
