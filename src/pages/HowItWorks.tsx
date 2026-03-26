import { useLanguage } from '@/i18n/LanguageContext';
import { motion } from 'framer-motion';
import { Shield, Clock, FileCheck } from 'lucide-react';

const steps = [1, 2, 3, 4] as const;

const HowItWorksPage = () => {
  const { t } = useLanguage();

  return (
    <div className="py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold text-center">{t('how.title')}</h1>
        <div className="mt-12 space-y-8">
          {steps.map((step, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="flex gap-4 items-start"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-emerald text-primary-foreground flex items-center justify-center text-lg font-bold shrink-0">
                {step}
              </div>
              <div>
                <h3 className="text-lg font-bold">{t(`how.step${step}.title`)}</h3>
                <p className="text-muted-foreground mt-1 leading-relaxed">{t(`how.step${step}.desc`)}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 grid sm:grid-cols-3 gap-6">
          {[
            { icon: Shield, titleKey: 'how.escrow.title', descKey: 'how.escrow.desc' },
            { icon: FileCheck, titleKey: 'how.verified.title', descKey: 'how.verified.desc' },
            { icon: Clock, titleKey: 'how.quick.title', descKey: 'how.quick.desc' },
          ].map((item) => (
            <div key={item.titleKey} className="text-center p-6 rounded-2xl bg-card border border-border shadow-card">
              <item.icon className="w-8 h-8 text-primary mx-auto" />
              <h4 className="font-bold mt-3">{t(item.titleKey)}</h4>
              <p className="text-sm text-muted-foreground mt-1">{t(item.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HowItWorksPage;
