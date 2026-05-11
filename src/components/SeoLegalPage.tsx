import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Loader2 } from 'lucide-react';
import { buildCanonical } from '@/lib/seoUtils';

interface Props {
  slug: string;
}

type LangKey = 'en' | 'ru' | 'he';

const pickLang = (locale: string): LangKey => {
  if (locale === 'ru') return 'ru';
  if (locale === 'he' || locale === 'ar') return 'he';
  return 'en';
};

export const SeoLegalPage = ({ slug }: Props) => {
  const { locale } = useLanguage();
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('seo_pages')
      .select('title_en,title_ru,title_he,meta_en,meta_ru,meta_he,h1_en,h1_ru,h1_he,content_en,content_ru,content_he,canonical_path,slug')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setRow(data ?? null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="container max-w-3xl py-24 text-center">
        <h1 className="text-2xl font-bold">Not found</h1>
      </div>
    );
  }

  const lang = pickLang(locale);
  const title = row[`title_${lang}`] || row.title_en;
  const meta = row[`meta_${lang}`] || row.meta_en;
  const h1 = row[`h1_${lang}`] || row.h1_en;
  const rawContent = row[`content_${lang}`] || row.content_en || '';
  const content = DOMPurify.sanitize(rawContent);
  const canonical = buildCanonical(row.canonical_path || row.slug);

  return (
    <div className="py-12">
      <Helmet>
        <title>{title}</title>
        {meta && <meta name="description" content={meta} />}
        <link rel="canonical" href={canonical} />
      </Helmet>
      <div className="container max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-8">{h1}</h1>
        <div
          className="prose prose-neutral dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    </div>
  );
};