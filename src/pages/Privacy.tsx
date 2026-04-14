import { useLanguage } from '@/i18n/LanguageContext';
import { LegalDocManager } from '@/components/LegalDocManager';

const PrivacyPage = () => {
  const { t } = useLanguage();
  return <LegalDocManager prefix="privacy" title={t('privacy.title')} />;
};

export default PrivacyPage;
