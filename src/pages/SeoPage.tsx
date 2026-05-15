import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { useTaskTranslations } from "@/hooks/useTaskTranslations";
import NotFound from "./NotFound";
import {
  slugFromPath,
  buildCanonical,
  getCachedSeo,
  setCachedSeo,
} from "@/lib/seoUtils";

type SeoRow = {
  id: string;
  slug: string;
  page_type: string;
  city_slug: string | null;
  category_slug: string | null;
  canonical_path: string | null;
  title_en: string; title_ru: string; title_he: string;
  meta_en: string; meta_ru: string; meta_he: string;
  h1_en: string; h1_ru: string; h1_he: string;
  content_en: string; content_ru: string; content_he: string;
  keywords: string[];
  faq: Array<Record<string, string>>;
};

type Lang = "en" | "ru" | "he";
type UiLocale = Lang | "ar";

const isSupportedLocale = (locale: string): locale is UiLocale =>
  locale === "en" || locale === "ru" || locale === "he" || locale === "ar";

// SEO content in the database exists for en/ru/he only.
// Arabic UI gets Arabic chrome via translations.ts. Page body falls back to
// English (not Hebrew) so an AR user never sees Hebrew script mixed with
// Arabic chrome — Latin fallback is the cleanest non-mixing option.
const contentLangKey = (l: string): Lang =>
  l === "ru" ? "ru" : l === "he" ? "he" : "en";

// Per-locale script matchers used to detect mixing in dynamic task fields
// (city/category_name from the DB are stored in the original task author's
// language). When the script doesn't match the active UI locale, we hide the
// raw value rather than show e.g. Russian text on an English/Arabic page.
const localeScriptMatchers: Record<UiLocale, RegExp> = {
  en: /[A-Za-z]/,
  ru: /[\u0400-\u04FF]/,
  he: /[\u0590-\u05FF]/,
  ar: /[\u0600-\u06FF]/,
};
function matchesLocaleScript(value: string | null, locale: UiLocale): boolean {
  if (!value) return false;
  const matcher = localeScriptMatchers[locale];
  if (!matcher) return true;
  const alpha = value.replace(/[\d\s\p{P}\p{S}]/gu, "");
  if (alpha.length === 0) return true;
  const re = new RegExp(matcher.source, "g");
  const matched = alpha.match(re);
  return (matched ? matched.join("").length : 0) / alpha.length >= 0.5;
}

function fillTemplate(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function buildTasksBlockStrings(
  citySlug: string | null,
  categorySlug: string | null,
  t: (k: string) => string,
) {
  const cityKey = citySlug ? `seo.city.${citySlug}` : null;
  const catKey = categorySlug ? `seo.cat.${categorySlug}` : null;
  const catLowerKey = categorySlug ? `seo.catLower.${categorySlug}` : null;
  const city = cityKey ? t(cityKey) || null : null;
  const cat = catKey ? t(catKey) || null : null;
  const catLower = catLowerKey ? t(catLowerKey) || cat : cat;

  const variant =
    cat && city ? "cityCat" : cat ? "cat" : city ? "city" : "default";
  const vars = { city: city || "", cat: cat || "", catLower: catLower || "" };

  return {
    title: fillTemplate(t(`seo.tasks.title.${variant}`), vars),
    empty: fillTemplate(t(`seo.tasks.empty.${variant}`), vars),
    cta: fillTemplate(t(`seo.tasks.cta.${variant}`), vars),
  };
}

export default function SeoPage() {
  const { pathname } = useLocation();
  const { locale, t } = useLanguage();
  const lang = contentLangKey(locale);
  const uiLocale: UiLocale = isSupportedLocale(locale) ? locale : "en";
  const slug = useMemo(() => slugFromPath(pathname), [pathname]);

  const [row, setRow] = useState<SeoRow | null>(null);
  const [related, setRelated] = useState<SeoRow[]>([]);
  const [loading, setLoading] = useState(() => getCachedSeo(slug) === undefined);
  const [notFound, setNotFound] = useState(false);
  const [publicTasks, setPublicTasks] = useState<
    Array<{ id: string; title: string; description: string | null; city: string | null; category_name: string | null; created_at: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    setNotFound(false);
    const cached = getCachedSeo(slug);
    if (cached !== undefined) {
      // Cached either as row or explicit null (= not published / missing)
      setRow((cached as unknown as SeoRow) || null);
      setNotFound(cached === null);
      setLoading(false);
      if (cached === null) return;
    } else {
      setLoading(true);
    }
    (async () => {
      const { data } = await supabase
        .from("seo_pages")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (cancelled) return;
      const r = (data as unknown as SeoRow) || null;
      setCachedSeo(slug, (r as unknown) as Record<string, unknown> | null);
      setRow(r);
      setNotFound(!r);

      if (r) {
        const filters: string[] = [];
        if (r.city_slug) filters.push(`city_slug.eq.${r.city_slug}`);
        if (r.category_slug) filters.push(`category_slug.eq.${r.category_slug}`);
        const q = supabase
          .from("seo_pages")
          .select("*")
          .eq("is_published", true)
          .neq("id", r.id)
          .limit(8);
        const { data: rel } = filters.length
          ? await q.or(filters.join(","))
          : await q;
        if (!cancelled) setRelated((rel as unknown as SeoRow[]) || []);

        // Fetch live public tasks for this city/category combo
        const { data: pt } = await supabase.rpc("get_seo_public_tasks" as never, {
          _city_slug: r.city_slug,
          _category_slug: r.category_slug,
          _result_limit: 10,
        } as never);
        if (!cancelled) {
          setPublicTasks(
            (((pt as unknown) as any[]) || []).map((task) => ({
              ...task,
              description: task.description ?? null,
            })),
          );
        }
      } else {
        setRelated([]);
        setPublicTasks([]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return <div className="container py-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (notFound || !row) return <NotFound />;

  const title = (row as any)[`title_${lang}`] || row.title_en;
  const meta = (row as any)[`meta_${lang}`] || row.meta_en;
  const h1 = (row as any)[`h1_${lang}`] || row.h1_en;
  const content = (row as any)[`content_${lang}`] || row.content_en;
  const canonical = buildCanonical(row.canonical_path || row.slug);
  const tasksStrings = buildTasksBlockStrings(row.city_slug, row.category_slug, t);
  const { getDisplayCopy: getTaskDisplayCopy } = useTaskTranslations(uiLocale, publicTasks);
  const createTaskHref = `/create-task${
    row.category_slug || row.city_slug
      ? `?${[
          row.category_slug ? `category=${row.category_slug}` : null,
          row.city_slug ? `city=${row.city_slug}` : null,
        ]
          .filter(Boolean)
          .join("&")}`
      : ""
  }`;

  // City-only pages get a "Popular services in <City>" internal-link block.
  const POPULAR_SERVICES = ["cleaning", "repair", "delivery", "moving", "handyman"] as const;
  const isCityOnlyPage = !!row.city_slug && !row.category_slug;
  const cityName = row.city_slug ? t(`seo.city.${row.city_slug}`) || row.city_slug : "";
  const popularServicesTitle = isCityOnlyPage
    ? uiLocale === "ru"
      ? `Популярные услуги в ${cityName}`
      : uiLocale === "he"
        ? `שירותים פופולריים ב${cityName}`
        : uiLocale === "ar"
          ? `الخدمات الشائعة في ${cityName}`
          : `Popular services in ${cityName}`
    : "";

  // Default FAQ fallback — guarantees every SEO page has a FAQ block + JSON-LD,
  // even if the seo_pages.faq column is empty. Existing FAQs are preserved.
  const catName = row.category_slug ? t(`seo.cat.${row.category_slug}`) || row.category_slug : "";
  const catLower = row.category_slug
    ? (t(`seo.catLower.${row.category_slug}`) || catName).toString().toLowerCase()
    : "";
  const subject = catLower || (lang === "ru" ? "услуги" : lang === "he" ? "שירותים" : "services");
  const place = cityName || (lang === "ru" ? "Израиле" : lang === "he" ? "ישראל" : "Israel");
  const defaultFaq: Array<Record<string, string>> =
    lang === "ru"
      ? [
          { question_ru: `Как работают ${subject} в ${place}?`, answer_ru: `Опубликуйте задачу с описанием и адресом — исполнители из ${place} пришлют предложения, а вы выберете подходящего по цене и рейтингу.` },
          { question_ru: `Как быстро можно найти исполнителя?`, answer_ru: `Большинство клиентов получают первые отклики в течение 15–60 минут после публикации задачи.` },
          { question_ru: `Проверены ли исполнители?`, answer_ru: `Каждый исполнитель проходит верификацию профиля, а отзывы и рейтинг помогают выбрать надёжного.` },
          { question_ru: `Поддерживается ли оплата через escrow?`, answer_ru: `Да. Деньги удерживаются на escrow и переводятся исполнителю только после завершения задачи.` },
        ]
      : lang === "he"
        ? [
            { question_he: `איך עובדים ${subject} ב${place}?`, answer_he: `פרסמו משימה עם תיאור וכתובת — נותני שירות מ${place} ישלחו הצעות, ותוכלו לבחור לפי מחיר ודירוג.` },
            { question_he: `כמה מהר אפשר למצוא בעל מקצוע?`, answer_he: `רוב הלקוחות מקבלים את ההצעות הראשונות תוך 15–60 דקות מרגע פרסום המשימה.` },
            { question_he: `האם בעלי המקצוע מאומתים?`, answer_he: `כל בעל מקצוע עובר אימות פרופיל, ודירוג וביקורות עוזרים לבחור את המתאים ביותר.` },
            { question_he: `האם נתמך תשלום בנאמנות (escrow)?`, answer_he: `כן. הכסף מוחזק בנאמנות ומועבר לבעל המקצוע רק לאחר סיום העבודה.` },
          ]
        : [
            { question_en: `How do ${subject} work in ${place}?`, answer_en: `Post a task with the details and address — taskers in ${place} will send offers and you pick the best one by price and rating.` },
            { question_en: `How fast can I find a tasker?`, answer_en: `Most clients receive their first offers within 15–60 minutes after posting a task.` },
            { question_en: `Are taskers verified?`, answer_en: `Every tasker passes profile verification, and ratings and reviews help you pick a trusted one.` },
            { question_en: `Is escrow payment supported?`, answer_en: `Yes. Funds are held in escrow and released to the tasker only after the task is completed.` },
          ];
  const effectiveFaq: Array<Record<string, string>> =
    row.faq && row.faq.length > 0 ? row.faq : defaultFaq;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: effectiveFaq.map((f) => ({
      "@type": "Question",
      name: f[`question_${lang}`] || f.question_en,
      acceptedAnswer: {
        "@type": "Answer",
        text: f[`answer_${lang}`] || f.answer_en,
      },
    })),
  };

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={meta} />
        {row.keywords?.length > 0 && (
          <meta name="keywords" content={row.keywords.join(", ")} />
        )}
        <link rel="canonical" href={canonical} />
        <link rel="alternate" hrefLang="en" href={`${canonical}?lang=en`} />
        <link rel="alternate" hrefLang="ru" href={`${canonical}?lang=ru`} />
        <link rel="alternate" hrefLang="he" href={`${canonical}?lang=he`} />
        <link rel="alternate" hrefLang="x-default" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={meta} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={meta} />
        {effectiveFaq.length > 0 && (
          <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        )}
      </Helmet>

      <article className="container py-10 max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-6 text-gradient-emerald">{h1}</h1>

        <div
          className="prose prose-neutral dark:prose-invert max-w-none mb-8 whitespace-pre-line"
        >
          {content}
        </div>

        <div className="flex flex-wrap gap-3 mb-10">
          <Button asChild size="lg">
            <Link to="/create-task">{t("hero.cta") || "Post a Task"}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/for-taskers">{t("nav.forTaskers") || "Become a Tasker"}</Link>
          </Button>
        </div>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{tasksStrings.title}</h2>
          {publicTasks.length === 0 ? (
            <p className="text-muted-foreground mb-4">{tasksStrings.empty}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {publicTasks.map((task) => {
                const displayTask = getTaskDisplayCopy(task);
                return (
                  <li
                    key={task.id}
                    className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
                  >
                    <div className="font-medium line-clamp-2">{displayTask.title}</div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-x-2">
                      {task.city && <span>{task.city}</span>}
                      {task.category_name && <span>· {task.category_name}</span>}
                      <span>· {new Date(task.created_at).toLocaleDateString(uiLocale)}</span>
                    </div>
                    <Link
                      to={`/task/${task.id}`}
                      className="text-sm text-primary hover:underline mt-auto"
                    >
                      {t("seo.tasks.viewTask") || "View task"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-6">
            <Button asChild size="lg">
              <Link to={createTaskHref}>{tasksStrings.cta}</Link>
            </Button>
          </div>
        </section>

        {effectiveFaq.length > 0 && (
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              {uiLocale === "ru" ? "FAQ" : uiLocale === "he" ? "שאלות נפוצות" : uiLocale === "ar" ? "الأسئلة الشائعة" : "FAQ"}
            </h2>
            <Accordion type="single" collapsible className="w-full">
              {effectiveFaq.map((f, i) => (
                <AccordionItem key={i} value={`q-${i}`}>
                  <AccordionTrigger className="text-left">
                    {f[`question_${lang}`] || f.question_en}
                  </AccordionTrigger>
                  <AccordionContent>
                    {f[`answer_${lang}`] || f.answer_en}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}

        {isCityOnlyPage && (
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{popularServicesTitle}</h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {POPULAR_SERVICES.map((service) => {
                const label = t(`seo.cat.${service}`) || service;
                return (
                  <li key={service}>
                    <Link
                      to={`/${row.city_slug}/${service}`}
                      className="text-primary hover:underline"
                    >
                      {label} {uiLocale === "he" ? `ב${cityName}` : uiLocale === "ar" ? `في ${cityName}` : uiLocale === "ru" ? `в ${cityName}` : `in ${cityName}`}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {related.length > 0 && (
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              {uiLocale === "ru" ? "Похожие страницы" : uiLocale === "he" ? "דפים קשורים" : uiLocale === "ar" ? "صفحات ذات صلة" : "Related pages"}
            </h2>
            <ul className="grid sm:grid-cols-2 gap-2">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/${r.slug}`}
                    className="text-primary hover:underline"
                  >
                    {(r as any)[`h1_${lang}`] || r.h1_en}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}