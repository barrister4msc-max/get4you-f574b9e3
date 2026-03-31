import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Construction } from 'lucide-react';
import { toast } from 'sonner';

const PrivacyPage = () => {
  const { t } = useLanguage();
  const { user, roles } = useAuth();
  const [content, setContent] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isAdmin = roles.includes('admin');

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    const { data } = await supabase.storage.from('portfolios').list('legal', { limit: 10 });
    const file = data?.find(f => f.name.startsWith('privacy'));
    if (file) {
      const { data: urlData } = supabase.storage.from('portfolios').getPublicUrl(`legal/${file.name}`);
      if (file.name.endsWith('.txt') || file.name.endsWith('.html') || file.name.endsWith('.md')) {
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
    const path = `legal/privacy.${ext}`;
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
        <h1 className="text-3xl font-bold text-center">{t('privacy.title')}</h1>

        {isAdmin && (
          <div className="mt-6 flex justify-center">
            <label>
              <Button variant="outline" className="cursor-pointer" disabled={loading} asChild>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('privacy.upload')}
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
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <Construction className="w-16 h-16 text-muted-foreground/50" />
              <h2 className="text-xl font-semibold text-foreground">{t('legal.inDevelopment')}</h2>
              <p className="text-muted-foreground max-w-md">{t('legal.inDevelopmentDesc')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
