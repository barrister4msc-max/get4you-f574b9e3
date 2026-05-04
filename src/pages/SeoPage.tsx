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
import NotFound from "./NotFound";

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
const langKey = (l: string): Lang => (l === "ru" || l === "he" ? l : "en");

export default function SeoPage() {
  const { pathname } = useLocation();
  const { locale, t } = useLanguage();
  const lang = langKey(locale);
  const slug = useMemo(() => pathname.replace(/^\/+/, "").replace(/\/+$/, ""), [pathname]);

  const [row, setRow] = useState<SeoRow | null>(null);
  const [related, setRelated] = useState<SeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("seo_pages")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (cancelled) return;
      const r = (data as unknown as SeoRow) || null;
      setRow(r);

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
      } else {
        setRelated([]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return <div className="container py-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (!row) return <NotFound />;

  const title = (row as any)[`title_${lang}`] || row.title_en;
  const meta = (row as any)[`meta_${lang}`] || row.meta_en;
  const h1 = (row as any)[`h1_${lang}`] || row.h1_en;
  const content = (row as any)[`content_${lang}`] || row.content_en;
  const canonical = `https://4you.ai${row.canonical_path || `/${row.slug}`}`;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (row.faq || []).map((f) => ({
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
        <meta property="og:title" content={title} />
        <meta property="og:description" content={meta} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={meta} />
        {row.faq?.length > 0 && (
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

        {row.faq?.length > 0 && (
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">FAQ</h2>
            <Accordion type="single" collapsible className="w-full">
              {row.faq.map((f, i) => (
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

        {related.length > 0 && (
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              {locale === "ru" ? "Похожие страницы" : locale === "he" ? "דפים קשורים" : "Related pages"}
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