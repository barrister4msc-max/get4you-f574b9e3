import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Loader2, FileText, ExternalLink } from 'lucide-react';
import { buildCanonical } from '@/lib/seoUtils';

interface Props {
  slug: string;
}

type LangKey = 'en' | 'ru' | 'he';

interface AttachedFile {
  id: string;
  name: string;
  url: string;
}

const pickLang = (locale: string): LangKey => {
  if (locale === 'ru') return 'ru';
  if (locale === 'he' || locale === 'ar') return 'he';
  return 'en';
};

export const SeoLegalPage = ({ slug }: Props) => {
  const { locale } = useLanguage();
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase
        .from('seo_pages')
        .select('title_en,title_ru,title_he,meta_en,meta_ru,meta_he,h1_en,h1_ru,h1_he,content_en,content_ru,content_he,canonical_path,slug')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle(),
      supabase
        .from('legal_documents')
        .select('id, file_name, public_url, created_at')
        .eq('prefix', slug)
        .order('created_at', { ascending: false }),
    ]).then(([pageRes, filesRes]) => {
      if (cancelled) return;
      setRow(pageRes.data ?? null);
      setFiles(
        (filesRes.data ?? []).map((f: any) => ({
          id: f.id,
          name: f.file_name,
          url: f.public_url,
        })),
      );
      setLoading(false);
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
        {files.length > 0 && (
          <div className="mt-10 border-t pt-6">
            <h2 className="text-lg font-semibold mb-3">Attached documents</h2>
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id}>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    {f.name}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};