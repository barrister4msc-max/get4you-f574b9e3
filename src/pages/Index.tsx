import { useGeolocation } from "@/hooks/useGeolocation";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { motion, useScroll, useTransform } from "framer-motion";
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
import heroImage from "@/assets/hero-image.png";
import heroImage2 from "@/assets/hero-image-2.jpg";

const sparklePositions = [
  { top: "15%", left: "42%", delay: 0, size: 4 },
  { top: "25%", left: "55%", delay: 0.8, size: 3 },
  { top: "20%", left: "38%", delay: 1.5, size: 5 },
  { top: "35%", left: "60%", delay: 0.3, size: 3 },
  { top: "40%", left: "45%", delay: 2.1, size: 4 },
  { top: "30%", left: "50%", delay: 1.2, size: 3 },
  { top: "50%", left: "48%", delay: 0.6, size: 5 },
  { top: "55%", left: "53%", delay: 1.8, size: 3 },
  { top: "18%", left: "58%", delay: 2.5, size: 4 },
  { top: "45%", left: "40%", delay: 0.4, size: 3 },
  { top: "60%", left: "52%", delay: 1.0, size: 4 },
  { top: "22%", left: "48%", delay: 2.8, size: 5 },
];

const categoryIcons = [
  { key: "cleaning", icon: Sparkles },
  { key: "moving", icon: Truck },
  { key: "repair", icon: Wrench },
  { key: "digital", icon: Monitor },
  { key: "consulting", icon: MessageCircle },
  { key: "delivery", icon: Package },
  { key: "beauty", icon: Heart },
  { key: "tutoring", icon: GraduationCap },
];

const stats = [
  { key: "hero.tasksCompleted", value: "12,400+" },
  { key: "hero.verifiedPros", value: "3,200+" },
  { key: "hero.satisfaction", value: "98%" },
];

const popularCategories = [
  { slug: "cleaning", label: "Cleaning" },
  { slug: "repair", label: "Repair" },
  { slug: "delivery", label: "Delivery" },
  { slug: "moving", label: "Moving" },
  { slug: "handyman", label: "Handyman" },
];

const popularCities = [
  { slug: "tel-aviv", label: "Tel Aviv" },
  { slug: "haifa", label: "Haifa" },
  { slug: "jerusalem", label: "Jerusalem" },
  { slug: "netanya", label: "Netanya" },
  { slug: "rishon-lezion", label: "Rishon LeZion" },
  { slug: "ashdod", label: "Ashdod" },
  { slug: "beersheba", label: "Beersheba" },
];

const faqItems = [
  {
    q: "How does 4You.AI work?",
    a: "Post your task, receive offers from verified taskers, compare profiles and prices, and choose the best one. Payment is held safely in escrow until the job is done.",
  },
  {
    q: "Is payment protected?",
    a: "Yes. Funds are held in escrow and only released to the tasker after you confirm the work is completed.",
  },
  {
    q: "How are taskers verified?",
    a: "Every tasker passes ID verification and signs a legal agreement before accepting tasks.",
  },
  {
    q: "How much does it cost?",
    a: "Posting a task is free. Taskers pay a small progressive service fee (7–12%) on completed jobs.",
  },
  {
    q: "Which cities are supported?",
    a: "All of Israel — including Tel Aviv, Haifa, Jerusalem, Netanya, Rishon LeZion, Ashdod, Beersheba and more.",
  },
];

const IndexPage = () => {
  const { t } = useLanguage();
  const { user, roles } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);

  return (
    <div>
      <Helmet>
        <title>4You.AI — Find trusted taskers in Israel</title>
        <meta
          name="description"
          content="Post a task, compare offers from verified taskers across Israel and pay safely with protected escrow. Cleaning, repair, delivery, moving and more."
        />
        <link rel="canonical" href="https://4you.ai/" />
        <meta property="og:title" content="4You.AI — Find trusted taskers in Israel" />
        <meta property="og:description" content="Post a task, compare offers and pay safely with escrow." />
        <meta property="og:url" content="https://4you.ai/" />
        <meta property="og:type" content="website" />
      </Helmet>
      {/* Hero — full-screen with background image, dark overlay & parallax */}
      <section
        ref={heroRef}
        className="relative min-h-[100svh] flex items-center overflow-hidden bg-gradient-to-br from-[hsl(210,35%,72%)] via-[hsl(200,28%,68%)] to-[hsl(40,20%,70%)]"
      >
        {/* Phoenix watermark */}
        <motion.div
          className="absolute inset-0 flex items-center justify-start md:pl-32"
          aria-hidden="true"
          animate={{
            y: [0, -12, 0],
            rotate: [0, 1.5, 0, -1.5, 0],
            scale: [1, 1.02, 1],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <img
            src={heroImage}
            alt=""
            width={1024}
            height={1024}
            className="h-[85%] w-auto max-w-none object-contain opacity-30"
            style={{
              mask: "radial-gradient(ellipse 50% 48% at center, black 60%, transparent 100%)",
              WebkitMask: "radial-gradient(ellipse 50% 48% at center, black 60%, transparent 100%)",
            }}
          />
        </motion.div>
        {/* Sparkles */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {sparklePositions.map((s, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-[hsl(42,80%,65%)]"
              style={{ top: s.top, left: s.left, width: s.size, height: s.size }}
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
            />
          ))}
        </div>
        {/* Subtle overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(40,15%,95%,0.6)] via-transparent to-transparent" />

        <div className="container relative z-10 py-20 md:py-28">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="flex-1 max-w-2xl"
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-foreground">
                Find trusted taskers in Israel with{" "}
                <span className="text-gradient-emerald">4You.AI</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
                Post a task, compare offers from verified taskers, choose the right person and pay
                safely — your money is protected by escrow until the job is done.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                {!isTaskerOnly && (
                  <Link
                    to="/create-task"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity"
                  >
                    Post a task
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                <Link
                  to="/for-taskers"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Become a tasker
                </Link>
                <button
                  onClick={handleFindNearby}
                  disabled={geoLoading || pendingNearby}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <MapPin className="w-4 h-4" />
                  {geoLoading || pendingNearby ? t("nearby.locating") : t("nearby.heroCta")}
                </button>
              </div>

              {geoError && <p className="mt-4 text-sm text-destructive">{geoError}</p>}

              <div className="mt-12 grid grid-cols-3 gap-6">
                {stats.map((s) => (
                  <div key={s.key}>
                    <div className="text-2xl md:text-3xl font-bold text-foreground">{s.value}</div>
                    <div className="text-sm text-muted-foreground mt-1">{t(s.key)}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="flex-1 hidden md:flex justify-center"
            >
              <img
                src={heroImage2}
                alt="Get4You services"
                className="w-full max-w-lg rounded-2xl object-cover border border-border/40 shadow-xl ring-1 ring-black/5"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 md:py-20">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-bold text-center">{t("cat.title")}</h2>
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
                    className="flex flex-col items-center justify-center gap-3 p-4 aspect-square rounded-2xl bg-card border border-border shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all"
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
            <div className="mt-8 flex justify-center gap-8">
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
          <h2 className="text-2xl md:text-3xl font-bold text-center">Popular categories</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {popularCategories.map((c) => (
              <Link
                key={c.slug}
                to={`/services/${c.slug}`}
                className="px-5 py-2.5 rounded-full border border-border bg-card text-foreground font-medium hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Popular cities */}
      <section className="py-12 md:py-16">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-bold text-center">Popular cities</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {popularCities.map((c) => (
              <Link
                key={c.slug}
                to={`/${c.slug}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-card text-foreground font-medium hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
              >
                <MapPin className="w-4 h-4 text-primary" />
                {c.label}
              </Link>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link to="/israel" className="text-primary hover:underline font-medium">
              View all of Israel →
            </Link>
          </div>
        </div>
      </section>

      {/* Payments */}
      <section className="py-16 md:py-20 bg-warm-surface">
        <div className="container max-w-3xl text-center">
          <h2 className="text-2xl md:text-3xl font-bold">Safe payments with escrow</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Pay through Allpay — funds are held securely in escrow and only released to the tasker
            after you confirm the job is done. Cards, bank transfer and cash/check options are
            supported. A small progressive service fee (7–12%) applies to taskers only.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20">
        <div className="container max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
            Frequently asked questions
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
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
                mainEntity: faqItems.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }}
          />
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              to="/create-task"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity"
            >
              Post a task
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/for-taskers"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-border text-foreground hover:bg-muted transition-colors"
            >
              Become a tasker
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default IndexPage;
