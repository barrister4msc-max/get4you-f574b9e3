import { useGeolocation } from "@/hooks/useGeolocation";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Shield,
  Star,
  Home,
  Truck,
  Wrench,
  Monitor,
  MessageCircle,
  Package,
  Heart,
  GraduationCap,
  MapPin,
} from "lucide-react";
import { useRef, useMemo, useEffect, useState } from "react";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { type ServiceKey } from "@/lib/serviceRegistry";
import { HomeHero } from "@/components/HomeHero";
import heroImage2 from "@/assets/hero-image-2.jpg";

const categoryIcons: { key: ServiceKey; icon: typeof Sparkles }[] = [
  { key: "cleaning", icon: Sparkles },
  { key: "moving", icon: Truck },
  { key: "repair", icon: Wrench },
  { key: "digital", icon: Monitor },
  { key: "consulting", icon: MessageCircle },
  { key: "delivery", icon: Package },
  { key: "beauty", icon: Heart },
  { key: "tutoring", icon: GraduationCap },
];

const popularCategories = [
  { slug: "cleaning", labels: { en: "Cleaning", ru: "Уборка", he: "ניקיון" } },
  { slug: "repair", labels: { en: "Repair", ru: "Ремонт", he: "תיקונים" } },
  { slug: "delivery", labels: { en: "Delivery", ru: "Доставка", he: "משלוחים" } },
  { slug: "moving", labels: { en: "Moving", ru: "Переезд", he: "הובלות" } },
  { slug: "handyman", labels: { en: "Handyman", ru: "Мастер на час", he: "הנדימן" } },
];

const popularCities = [
  { slug: "tel-aviv", labels: { en: "Tel Aviv", ru: "Тель-Авив", he: "תל אביב" } },
  { slug: "haifa", labels: { en: "Haifa", ru: "Хайфа", he: "חיפה" } },
  { slug: "jerusalem", labels: { en: "Jerusalem", ru: "Иерусалим", he: "ירושלים" } },
  { slug: "netanya", labels: { en: "Netanya", ru: "Нетания", he: "נתניה" } },
  { slug: "rishon-lezion", labels: { en: "Rishon LeZion", ru: "Ришон-ле-Цион", he: "ראשון לציון" } },
  { slug: "ashdod", labels: { en: "Ashdod", ru: "Ашдод", he: "אשדוד" } },
  { slug: "beersheba", labels: { en: "Beersheba", ru: "Беэр-Шева", he: "באר שבע" } },
];

type L = "en" | "ru" | "he";
const pickLang = (loc: string): L => (loc === "ru" || loc === "he" ? loc : "en");

const HOME_I18N: Record<L, {
  metaTitle: string;
  metaDesc: string;
  h1Pre: string;
  h1Brand: string;
  subtitle: string;
  ctaPost: string;
  ctaBecome: string;
  popularCats: string;
  popularCities: string;
  viewAll: string;
  paymentsTitle: string;
  paymentsDesc: string;
  faqTitle: string;
  faq: { q: string; a: string }[];
}> = {
  en: {
    metaTitle: "Any task — A reliable pro | HandyMan4You.AI Ltd",
    metaDesc: "Any task — a reliable pro. Post a task, compare offers from verified taskers across Israel and pay safely with protected escrow.",
    h1Pre: "Any task —",
    h1Brand: "A reliable pro",
    subtitle: "Post a task, compare offers from verified taskers, choose the right person and pay safely — your money is protected by escrow until the job is done.",
    ctaPost: "How can we help?",
    ctaBecome: "Become a tasker",
    popularCats: "Popular categories",
    popularCities: "Popular cities",
    viewAll: "View all of Israel →",
    paymentsTitle: "Safe payments with escrow",
    paymentsDesc: "Pay through Allpay — funds are held securely in escrow and only released to the tasker after you confirm the job is done. Cards, bank transfer and cash/check options are supported. A small progressive service fee (7–12%) applies to taskers only.",
    faqTitle: "Frequently asked questions",
    faq: [
      { q: "How does HandyMan4You.AI Ltd work?", a: "Post your task, receive offers from verified taskers, compare profiles and prices, and choose the best one. Payment is held safely in escrow until the job is done." },
      { q: "Is payment protected?", a: "Yes. Funds are held in escrow and only released to the tasker after you confirm the work is completed." },
      { q: "How are taskers verified?", a: "Every tasker passes ID verification and signs a legal agreement before accepting tasks." },
      { q: "How much does it cost?", a: "Posting a task is free. Taskers pay a small progressive service fee (7–12%) on completed jobs." },
      { q: "Which cities are supported?", a: "All of Israel — including Tel Aviv, Haifa, Jerusalem, Netanya, Rishon LeZion, Ashdod, Beersheba and more." },
    ],
  },
  ru: {
    metaTitle: "Любая задача — надёжный исполнитель | HandyMan4You.AI Ltd",
    metaDesc: "Любая задача — надёжный исполнитель. Опубликуйте задачу, сравните предложения проверенных исполнителей по всему Израилю и оплатите безопасно через эскроу.",
    h1Pre: "Любая задача —",
    h1Brand: "надёжный исполнитель",
    subtitle: "Опубликуйте задачу, сравните предложения проверенных исполнителей, выберите подходящего и оплатите безопасно — деньги защищены через эскроу до завершения работ.",
    ctaPost: "Чем помочь?",
    ctaBecome: "Стать исполнителем",
    popularCats: "Популярные категории",
    popularCities: "Популярные города",
    viewAll: "Посмотреть весь Израиль →",
    paymentsTitle: "Безопасные платежи через эскроу",
    paymentsDesc: "Оплата через Allpay — средства надёжно хранятся в эскроу и переводятся исполнителю только после подтверждения выполнения работы. Поддерживаются карты, банковский перевод и оплата наличными/чеком. Небольшая прогрессивная комиссия (7–12%) удерживается только с исполнителей.",
    faqTitle: "Часто задаваемые вопросы",
    faq: [
      { q: "Как работает HandyMan4You.AI Ltd?", a: "Опубликуйте задачу, получите предложения от проверенных исполнителей, сравните профили и цены, выберите лучшего. Оплата надёжно хранится в эскроу до завершения работ." },
      { q: "Защищена ли оплата?", a: "Да. Средства хранятся в эскроу и переводятся исполнителю только после подтверждения выполнения." },
      { q: "Как проверяются исполнители?", a: "Каждый исполнитель проходит проверку личности и подписывает договор перед началом работы." },
      { q: "Сколько это стоит?", a: "Публикация задачи бесплатна. Исполнители платят небольшую прогрессивную комиссию (7–12%) с выполненных заказов." },
      { q: "Какие города поддерживаются?", a: "Весь Израиль — включая Тель-Авив, Хайфу, Иерусалим, Нетанию, Ришон-ле-Цион, Ашдод, Беэр-Шеву и другие." },
    ],
  },
  he: {
    metaTitle: "כל משימה — מקצוען אמין | HandyMan4You.AI Ltd",
    metaDesc: "כל משימה — מקצוען אמין. פרסמו משימה, השוו הצעות מנותני שירות מאומתים בישראל ושלמו בבטחה דרך נאמנות.",
    h1Pre: "כל משימה —",
    h1Brand: "מקצוען אמין",
    subtitle: "פרסמו משימה, השוו הצעות מנותני שירות מאומתים, בחרו את האדם הנכון ושלמו בבטחה — הכסף שלכם מוגן בנאמנות עד לסיום העבודה.",
    ctaPost: "במה לעזור?",
    ctaBecome: "הצטרף כנותן שירות",
    popularCats: "קטגוריות פופולריות",
    popularCities: "ערים פופולריות",
    viewAll: "צפו בכל ישראל ←",
    paymentsTitle: "תשלומים מאובטחים בנאמנות",
    paymentsDesc: "תשלום דרך Allpy — הכספים נשמרים בנאמנות ומועברים לנותן השירות רק לאחר שאתם מאשרים שהעבודה הסתיימה. נתמכים כרטיסי אשראי, העברה בנקאית ומזומן/צ'ק. עמלת שירות פרוגרסיבית קטנה (7–12%) נגבית מנותני השירות בלבד.",
    faqTitle: "שאלות נפוצות",
    faq: [
      { q: "איך HandyMan4You.AI Ltd עובד?", a: "פרסמו משימה, קבלו הצעות מנותני שירות מאומתים, השוו פרופילים ומחירים ובחרו את הטוב ביותר. התשלום נשמר בנאמנות עד לסיום העבודה." },
      { q: "האם התשלום מוגן?", a: "כן. הכספים נשמרים בנאמנות ומועברים לנותן השירות רק לאחר שאתם מאשרים את סיום העבודה." },
      { q: "איך נותני השירות מאומתים?", a: "כל נותן שירות עובר אימות זהות וחותם על הסכם משפטי לפני קבלת משימות." },
      { q: "כמה זה עולה?", a: "פרסום משימה חינם. נותני שירות משלמים עמלת שירות פרוגרסיבית קטנה (7–12%) על עבודות שהושלמו." },
      { q: "אילו ערים נתמכות?", a: "כל ישראל — כולל תל אביב, חיפה, ירושלים, נתניה, ראשון לציון, אשדוד, באר שבע ועוד." },
    ],
  },
};

const IndexPage = () => {
  const { t, locale, dir, setLocale } = useLanguage();
  const lang = pickLang(locale);
  const i18n = HOME_I18N[lang];
  const { user, roles } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Sync ?lang=he|ru|en with selected locale
  useEffect(() => {
    const q = searchParams.get("lang");
    if (q === "en" || q === "ru" || q === "he") {
      if (q !== locale) setLocale(q);
    }
  }, [searchParams, locale, setLocale]);
  const { latitude, longitude, loading: geoLoading, error: geoError, getCurrentLocation } = useGeolocation();
  const [pendingNearby, setPendingNearby] = useState(false);

  const goToNearbyTasks = (lat: number, lng: number) => {
    navigate(`/tasks?nearby=1&lat=${lat}&lng=${lng}`);
  };

  const handleFindNearby = () => {
    if (latitude && longitude) {
      goToNearbyTasks(latitude, longitude);
    } else {
      setPendingNearby(true);
      getCurrentLocation();
    }
  };

  useEffect(() => {
    if (pendingNearby && latitude && longitude) {
      setPendingNearby(false);
      goToNearbyTasks(latitude, longitude);
    }
  }, [pendingNearby, latitude, longitude]);
  // Handle OAuth callback / errors landing on homepage
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const params = new URLSearchParams(hash.replace("#", "?"));
    const errorDesc = params.get("error_description") || searchParams.get("error_description");
    const error = params.get("error") || searchParams.get("error");
    if (error || errorDesc) {
      const msg = errorDesc || error || "OAuth error";
      toast.error(
        msg.includes("initial state")
          ? "Ошибка авторизации. Попробуйте другой браузер или отключите блокировку трекеров."
          : msg,
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams]);
  const isTaskerOnly = user && roles.length > 0 && roles.every((r) => r === "tasker");
  // Always allow visitors to start creating a task without login.
  // Registration is prompted on publish (motivation modal in CreateTask).
  const postTaskHref = "/create-task";
  const becomeTaskerHref = user ? "/for-taskers" : "/signup?role=tasker";

  return (
    <div>
      <Helmet>
        <html lang={lang} dir={dir} />
        <title>{i18n.metaTitle}</title>
        <meta name="description" content={i18n.metaDesc} />
        <link rel="canonical" href={`https://4you.ai/${lang === "en" ? "" : `?lang=${lang}`}`} />
        <link rel="alternate" hrefLang="en" href="https://4you.ai/" />
        <link rel="alternate" hrefLang="ru" href="https://4you.ai/?lang=ru" />
        <link rel="alternate" hrefLang="he" href="https://4you.ai/?lang=he" />
        <link rel="alternate" hrefLang="x-default" href="https://4you.ai/" />
        <meta property="og:title" content={i18n.metaTitle} />
        <meta property="og:description" content={i18n.metaDesc} />
        <meta property="og:url" content={`https://4you.ai/${lang === "en" ? "" : `?lang=${lang}`}`} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content={lang === "ru" ? "ru_RU" : lang === "he" ? "he_IL" : "en_US"} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={i18n.metaTitle} />
        <meta name="twitter:description" content={i18n.metaDesc} />
      </Helmet>
      <HomeHero
        serviceLabel={locale === "ru" ? "Выберите услугу" : locale === "he" ? "בחרו שירות" : locale === "ar" ? "اختر خدمة" : "Choose a service"}
        services={categoryIcons.map((cat) => ({ ...cat, label: t(`cat.${cat.key}`) }))}
        title={<>{i18n.h1Pre} <span className="text-gradient-emerald">{i18n.h1Brand}</span></>}
        description={i18n.subtitle}
        image={heroImage2}
      >
            <div className="home-banner-actions mt-4 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
              {!isTaskerOnly && <Button asChild size="lg" className="min-h-12 h-auto px-3 sm:px-8 py-3 whitespace-normal font-bold text-base bg-accent text-accent-foreground hover:bg-accent/90"><Link to={postTaskHref}>{i18n.ctaPost}<ArrowRight className="rtl:rotate-180" /></Link></Button>}
              <Button asChild variant="outline" size="lg" className="min-h-12 h-auto px-3 sm:px-8 py-3 whitespace-normal font-bold text-base"><Link to={becomeTaskerHref}>{i18n.ctaBecome}</Link></Button>
              <Button variant="outline" size="lg" onClick={handleFindNearby} disabled={geoLoading || pendingNearby} className="col-span-2 justify-self-start min-h-12 h-auto px-3 sm:px-8 py-3 whitespace-normal font-bold text-base"><MapPin />{geoLoading || pendingNearby ? t("nearby.locating") : t("nearby.heroCta")}</Button>
            </div>
            {geoError && <p className="mt-4 text-base text-destructive">{t("task.geo.enterManually")}</p>}
      </HomeHero>

      {/* How it works */}
      <section className="py-16 md:py-20 bg-warm-surface">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-bold text-center">{t("how.title")}</h2>
          <div className="mt-12 grid md:grid-cols-5 gap-6">
            {[1, 2, 3, 4, 5].map((step, i) => (
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
            <h2 className="mt-4 text-2xl md:text-3xl font-bold">{t("escrow.title")}</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">{t("escrow.desc")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4 sm:gap-8">
              {[
                { icon: CheckCircle2, text: t("escrow.verified") },
                { icon: Shield, text: t("escrow.secure") },
                { icon: Star, text: t("escrow.rated") },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <item.icon className="w-5 h-5 text-primary" />
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Popular categories (SEO links) */}
      <section className="py-12 md:py-16 bg-warm-surface">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-bold text-center">{i18n.popularCats}</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {popularCategories.map((c) => (
              <Link
                key={c.slug}
                to={`/services/${c.slug}`}
                className="px-5 py-2.5 rounded-full border border-border bg-card text-foreground font-medium hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
              >
                {c.labels[lang]}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Popular cities */}
      <section className="py-12 md:py-16">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-bold text-center">{i18n.popularCities}</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {popularCities.map((c) => (
              <Link
                key={c.slug}
                to={`/${c.slug}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-card text-foreground font-medium hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
              >
                <MapPin className="w-4 h-4 text-primary" />
                {c.labels[lang]}
              </Link>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link to="/israel" className="text-primary hover:underline font-medium">
              {i18n.viewAll}
            </Link>
          </div>
        </div>
      </section>

      {/* Payments */}
      <section className="py-16 md:py-20 bg-warm-surface">
        <div className="container max-w-3xl text-center">
          <h2 className="text-2xl md:text-3xl font-bold">{i18n.paymentsTitle}</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">{i18n.paymentsDesc}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20">
        <div className="container max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
            {i18n.faqTitle}
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {i18n.faq.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-start text-base font-semibold">{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                inLanguage: lang,
                mainEntity: i18n.faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }}
          />
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              to={postTaskHref}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity"
            >
              {i18n.ctaPost}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to={becomeTaskerHref}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-border text-foreground hover:bg-muted transition-colors"
            >
              {i18n.ctaBecome}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default IndexPage;
