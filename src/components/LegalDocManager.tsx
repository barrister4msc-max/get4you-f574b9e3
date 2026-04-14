import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, Trash2, Pencil, Check, X, Construction, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface FileItem {
  id: string;
  name: string;
  storagePath: string;
  url: string;
}

interface Props {
  prefix: string;
  title: string;
}

export const LegalDocManager = ({ prefix, title }: Props) => {
  const { t } = useLanguage();
  const { roles } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const isAdmin = roles.includes('admin');

  const loadFiles = useCallback(async () => {
    const { data } = await supabase
      .from('legal_documents')
      .select('*')
      .eq('prefix', prefix)
      .order('created_at', { ascending: false });

    if (data) {
      setFiles(data.map(d => ({
        id: d.id,
        name: d.file_name,
        storagePath: d.storage_path,
        url: d.public_url,
      })));
    }
  }, [prefix]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = e.target.files;
    if (!uploadFiles?.length) return;
    setLoading(true);
    for (const file of Array.from(uploadFiles)) {
      const ts = Date.now();
      const fileName = `${prefix}_${ts}_${file.name}`;
      const storagePath = `legal/${fileName}`;
      const { error } = await supabase.storage.from('portfolios').upload(storagePath, file, { upsert: true });
      if (error) { toast.error(`${file.name}: ${error.message}`); continue; }

      const { data: urlData } = supabase.storage.from('portfolios').getPublicUrl(storagePath);

      const { error: dbError } = await supabase.from('legal_documents').insert({
        prefix,
        file_name: file.name,
        storage_path: storagePath,
        public_url: urlData.publicUrl,
      });
      if (dbError) toast.error(`DB: ${dbError.message}`);
    }
    toast.success(t('legal.uploaded'));
    await loadFiles();
    setLoading(false);
    e.target.value = '';
  };

  const handleDelete = async (file: FileItem) => {
    if (!confirm(t('legal.confirmDelete'))) return;
    await supabase.storage.from('portfolios').remove([file.storagePath]);
    const { error } = await supabase.from('legal_documents').delete().eq('id', file.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t('legal.deleted'));
    await loadFiles();
  };

  const handleRename = async (file: FileItem) => {
    if (!newName.trim() || newName === file.name) { setRenamingFile(null); return; }
    const ext = file.name.split('.').pop();
    const finalName = newName.includes('.') ? newName : `${newName}.${ext}`;

    const { error } = await supabase
      .from('legal_documents')
      .update({ file_name: finalName })
      .eq('id', file.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t('legal.renamed'));
    setRenamingFile(null);
    await loadFiles();
  };

  return (
    <div className="py-16">
      <div className="container max-w-3xl">
        <h1 className="text-3xl font-bold text-center">{title}</h1>

        {isAdmin && (
          <div className="mt-6 flex justify-center">
            <label>
              <Button variant="outline" className="cursor-pointer" disabled={loading} asChild>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('legal.uploadDocs')}
                  <input type="file" className="hidden" onChange={handleUpload} accept=".txt,.html,.md,.pdf,.doc,.docx" multiple />
                </span>
              </Button>
            </label>
          </div>
        )}

        <div className="mt-8 space-y-3">
          {files.length > 0 ? (
            files.map((file) => (
              <Card key={file.id}>
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <FileText className="w-5 h-5 text-primary shrink-0" />

                  {renamingFile === file.id ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        className="h-8 text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleRename(file)}
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => handleRename(file)}>
                        <Check className="w-4 h-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setRenamingFile(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                        {file.name}
                        <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                      </a>
                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setRenamingFile(file.id); setNewName(file.name.replace(/\.[^.]+$/, '')); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(file)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))
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
