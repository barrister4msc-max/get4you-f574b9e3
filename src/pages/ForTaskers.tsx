import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useEsekPaturCount } from '@/hooks/useEsekPaturCount';
import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight, UserPlus, FileSignature, Clock, UserCheck, Globe, Megaphone, ShieldCheck, Search, TrendingUp, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState } from 'react';

const benefits = [
  { icon: Clock, key: 'taskers.benefit.quickStart' },
  { icon: UserCheck, key: 'taskers.benefit.profile' },
  { icon: Globe, key: 'taskers.benefit.noWebsite' },
  { icon: Megaphone, key: 'taskers.benefit.seoAds' },
  { icon: ShieldCheck, key: 'taskers.benefit.brandTrust' },
  { icon: Search, key: 'taskers.benefit.matching' },
  { icon: TrendingUp, key: 'taskers.benefit.noSearch' },
  { icon: Star, key: 'taskers.benefit.ratingEarnings' },
];

const plans = [
  { key: 'starter', commission: '15%', price: 0, featureKeys: ['taskers.feature.basicProfile', 'taskers.feature.5offers', 'taskers.feature.standardSupport'] },
  { key: 'pro', commission: '10%', price: 29, featureKeys: ['taskers.feature.verifiedBadge', 'taskers.feature.20offers', 'taskers.feature.prioritySearch', 'taskers.feature.analytics'] },
  { key: 'expert', commission: '7%', price: 59, featureKeys: ['taskers.feature.expertBadge', 'taskers.feature.unlimitedOffers', 'taskers.feature.topSearch', 'taskers.feature.dedicatedSupport', 'taskers.feature.featuredProfile'] },
];

const ForTaskersPage = () => {
  const { t, currency } = useLanguage();
  const { user, roles, refreshProfile } = useAuth();
  const [adding, setAdding] = useState(false);
  const { remaining, total } = useEsekPaturCount();

  const isTaskerOnly = user && roles.length > 0 && roles.every(r => r === 'tasker');
  const isClient = roles.includes('client');

  const becomeClient = async () => {
    if (!user) return;
    setAdding(true);
    try {
      const { error } = await supabase.from('user_roles').insert({ user_id: user.id, role: 'client' as any });
      if (error) throw error;
      await refreshProfile();
      toast.success(t('taskers.becomeClient.success'));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="py-16">
      <div className="container max-w-4xl">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-bold">{t('taskers.title')}</h1>
          <p className="text-lg text-muted-foreground mt-3">{t('taskers.subtitle')}</p>
        </div>

        {/* Benefits section */}
        <div className="mt-14">
          <h2 className="text-2xl font-bold text-center">{t('taskers.benefits.title')}</h2>
          <p className="text-muted-foreground text-center mt-2">{t('taskers.benefits.subtitle')}</p>
          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            {benefits.map((b, i) => (
              <motion.div
                key={b.key}
                initial={{ opacity: 0, x: i % 2 === 0 ? -15 : 15 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card"
              >
                <b.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">{t(b.key)}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Rating → Earnings bridge — clicks to plans */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}
          className="mt-8 p-5 rounded-2xl border border-primary/20 bg-primary/5 text-center cursor-pointer hover:bg-primary/10 transition-colors"
        >
          <p className="font-semibold text-primary">{t('taskers.ratingBridge')}</p>
          <p className="text-xs text-primary/70 mt-1">{t('taskers.ratingBridge.clickHint')}</p>
        </motion.div>

        <h2 id="plans" className="text-2xl font-bold text-center mt-14 scroll-mt-20">{t('taskers.plans.title')}</h2>
        <div className="mt-6 grid md:grid-cols-3 gap-6">
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

        {/* Contractor Agreement CTA */}
        <div className="mt-12 p-8 rounded-2xl border border-primary/30 bg-primary/5 text-center">
          <FileSignature className="w-10 h-10 text-primary mx-auto mb-3" />
          <h2 className="text-xl font-bold">{t('contract.cta.title')}</h2>
          <p className="text-muted-foreground mt-2">{t('contract.cta.description')}</p>
          <div className="mt-4">
            <Link
              to="/contractor-agreement"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              {t('contract.cta.button')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Esek Patur CTA */}
        <div className="mt-8 text-center p-8 rounded-2xl border border-border bg-card shadow-card">
          <h2 className="text-xl font-bold">{t('esek.title')}</h2>
          <p className="text-muted-foreground mt-2">{t('esek.subtitle')}</p>
          <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/30">
            <p className="text-sm font-semibold text-primary">🎉 {t('esek.promo.title')}</p>
            {remaining !== null && remaining < total && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('esek.promo.remaining').replace('{remaining}', String(remaining)).replace('{total}', String(total))}
              </p>
            )}
          </div>
          <div className="mt-4">
            <Link
              to="/esek-patur"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              {t('esek.nav')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForTaskersPage;
