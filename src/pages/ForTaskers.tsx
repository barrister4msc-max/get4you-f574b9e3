import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight } from 'lucide-react';

const plans = [
  { key: 'starter', commission: '15%', price: 0, featureKeys: ['taskers.feature.basicProfile', 'taskers.feature.5offers', 'taskers.feature.standardSupport'] },
  { key: 'pro', commission: '10%', price: 29, featureKeys: ['taskers.feature.verifiedBadge', 'taskers.feature.20offers', 'taskers.feature.prioritySearch', 'taskers.feature.analytics'] },
  { key: 'expert', commission: '7%', price: 59, featureKeys: ['taskers.feature.expertBadge', 'taskers.feature.unlimitedOffers', 'taskers.feature.topSearch', 'taskers.feature.dedicatedSupport', 'taskers.feature.featuredProfile'] },
];

const ForTaskersPage = () => {
  const { t, currency } = useLanguage();

  return (
    <div className="py-16">
      <div className="container max-w-4xl">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-bold">{t('taskers.title')}</h1>
          <p className="text-lg text-muted-foreground mt-3">{t('taskers.subtitle')}</p>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`rounded-2xl border p-6 ${
                i === 1 ? 'border-primary bg-emerald-50 shadow-trust' : 'border-border bg-card shadow-card'
              }`}
            >
              <h3 className="font-bold text-lg">{t(`taskers.plan.${plan.key}`)}</h3>
              <div className="mt-2">
                <span className="text-3xl font-extrabold text-primary">{plan.commission}</span>
                <span className="text-sm text-muted-foreground ms-1">{t('taskers.commission')}</span>
              </div>
              {plan.price > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {currency === 'ILS' ? `₪${Math.round(plan.price * 3.7)}` : `$${plan.price}`}{t('taskers.perMonth')}
                </p>
              )}
              <ul className="mt-5 space-y-2">
                {plan.featureKeys.map((fKey) => (
                  <li key={fKey} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    {t(fKey)}
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-opacity ${
                  i === 1
                    ? 'bg-accent text-accent-foreground hover:opacity-90'
                    : 'border border-border text-foreground hover:bg-secondary'
                }`}
              >
                {t('taskers.cta')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ForTaskersPage;
