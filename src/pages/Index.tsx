import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';
import {
  Sparkles, ArrowRight, CheckCircle2, Shield, Star,
  Home, Truck, Wrench, Monitor, MessageCircle, Package, Heart, GraduationCap,
} from 'lucide-react';
import heroImage from '@/assets/hero-image.jpg';

const categoryIcons = [
  { key: 'cleaning', icon: Sparkles },
  { key: 'moving', icon: Truck },
  { key: 'repair', icon: Wrench },
  { key: 'digital', icon: Monitor },
  { key: 'consulting', icon: MessageCircle },
  { key: 'delivery', icon: Package },
  { key: 'beauty', icon: Heart },
  { key: 'tutoring', icon: GraduationCap },
];

const stats = [
  { key: 'hero.tasksCompleted', value: '12,400+' },
  { key: 'hero.verifiedPros', value: '3,200+' },
  { key: 'hero.satisfaction', value: '98%' },
];

const IndexPage = () => {
  const { t } = useLanguage();
  const { user, roles } = useAuth();
  const isTaskerOnly = user && roles.length > 0 && roles.every(r => r === 'tasker');

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-background to-warm-surface" />
        <div className="container relative py-20 md:py-28">
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-8 md:gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
                {t('hero.title')}{' '}
                <span className="text-gradient-emerald">{t('hero.titleAccent')}</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
                {t('hero.subtitle')}
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                {!isTaskerOnly && (
                  <Link
                    to="/create-task"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity"
                  >
                    {t('hero.cta')}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                <Link
                  to="/tasks"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-border text-foreground hover:bg-secondary transition-colors"
                >
                  {t('hero.browse')}
                </Link>
              </div>

              <div className="mt-12 grid grid-cols-3 gap-6">
                {stats.map((s) => (
                  <div key={s.key}>
                    <div className="text-2xl md:text-3xl font-bold text-primary">{s.value}</div>
                    <div className="text-sm text-muted-foreground mt-1">{t(s.key)}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="hidden md:block"
            >
              <img
                src={heroImage}
                alt="TaskFlow — professionals helping with everyday tasks"
                className="w-full rounded-3xl shadow-card-hover"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 md:py-20">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-bold text-center">{t('cat.title')}</h2>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {categoryIcons.map((cat, i) => {
              const Icon = cat.icon;
              return (
                <motion.div
                  key={cat.key}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={`/tasks?category=${cat.key}`}
                    className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-card border border-border shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all"
                  >
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">{t(`cat.${cat.key}`)}</span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-20 bg-warm-surface">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-bold text-center">{t('how.title')}</h2>
          <div className="mt-12 grid md:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((step, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-emerald text-primary-foreground flex items-center justify-center mx-auto text-xl font-bold">
                  {step}
                </div>
                <h3 className="mt-4 font-bold text-foreground">{t(`how.step${step}.title`)}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t(`how.step${step}.desc`)}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust section */}
      <section className="py-16 md:py-20">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center">
            <Shield className="w-12 h-12 text-primary mx-auto" />
            <h2 className="mt-4 text-2xl md:text-3xl font-bold">{t('trust.title')}</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              {t('trust.desc')}
            </p>
            <div className="mt-8 flex justify-center gap-8">
              {[
                { icon: CheckCircle2, key: 'trust.verified' },
                { icon: Shield, key: 'trust.secure' },
                { icon: Star, key: 'trust.rated' },
              ].map((item) => (
                <div key={item.key} className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <item.icon className="w-5 h-5 text-primary" />
                  {t(item.key)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default IndexPage;
