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
            { icon: Shield, title: 'Escrow Protection', desc: 'Funds held securely until work is approved' },
            { icon: FileCheck, title: 'Verified Pros', desc: 'Identity and skills verification' },
            { icon: Clock, title: 'Quick & Easy', desc: 'Post a task in under 2 minutes' },
          ].map((item) => (
            <div key={item.title} className="text-center p-6 rounded-2xl bg-card border border-border shadow-card">
              <item.icon className="w-8 h-8 text-primary mx-auto" />
              <h4 className="font-bold mt-3">{item.title}</h4>
              <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HowItWorksPage;
