import { useLanguage } from '@/i18n/LanguageContext';
import { LegalDocManager } from '@/components/LegalDocManager';

const PrivacyPage = () => {
  const { t } = useLanguage();
  return <LegalDocManager folder="privacy" title={t('privacy.title')} />;
};

export default PrivacyPage;
