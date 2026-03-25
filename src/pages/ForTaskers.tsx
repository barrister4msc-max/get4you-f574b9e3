import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight } from 'lucide-react';

const plans = [
  { key: 'starter', commission: '15%', price: 0, features: ['Basic profile', 'Up to 5 active offers', 'Standard support'] },
  { key: 'pro', commission: '10%', price: 29, features: ['Verified badge', 'Up to 20 active offers', 'Priority in search', 'Analytics dashboard'] },
  { key: 'expert', commission: '7%', price: 59, features: ['Expert badge', 'Unlimited offers', 'Top search placement', 'Dedicated support', 'Featured profile'] },
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
                  {currency === 'ILS' ? `₪${Math.round(plan.price * 3.7)}` : `$${plan.price}`}/mo
                </p>
              )}
              <ul className="mt-5 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-opacity ${
                  i === 1
                    ? 'bg-gradient-emerald text-primary-foreground hover:opacity-90'
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
