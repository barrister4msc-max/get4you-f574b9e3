import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';

const TermsPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [content, setContent] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    // Try to load terms.html or terms.txt from storage
    const { data } = await supabase.storage.from('portfolios').list('legal', { limit: 10 });
    const termsFile = data?.find(f => f.name.startsWith('terms'));
    if (termsFile) {
      const { data: urlData } = supabase.storage.from('portfolios').getPublicUrl(`legal/${termsFile.name}`);
      if (termsFile.name.endsWith('.txt') || termsFile.name.endsWith('.html') || termsFile.name.endsWith('.md')) {
        const resp = await fetch(urlData.publicUrl);
        const text = await resp.text();
        setContent(text);
      } else {
        setFileUrl(urlData.publicUrl);
      }
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const ext = file.name.split('.').pop();
    const path = `legal/terms.${ext}`;
    const { error } = await supabase.storage.from('portfolios').upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Uploaded!');
      await loadContent();
    }
    setLoading(false);
  };

  return (
    <div className="py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold text-center">{t('terms.title')}</h1>

        {user && (
          <div className="mt-6 flex justify-center">
            <label>
              <Button variant="outline" className="cursor-pointer" disabled={loading} asChild>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('terms.upload')}
                  <input type="file" className="hidden" onChange={handleUpload} accept=".txt,.html,.md,.pdf,.doc,.docx" />
                </span>
              </Button>
            </label>
          </div>
        )}

        <div className="mt-8 prose prose-sm max-w-none dark:prose-invert">
          {content ? (
            <div dangerouslySetInnerHTML={{ __html: content }} />
          ) : fileUrl ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <FileText className="w-12 h-12 text-muted-foreground" />
              <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Download Document
              </a>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-12">{t('terms.noContent')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
