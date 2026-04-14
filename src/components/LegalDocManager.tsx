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

const getDisplayNameFromStorage = (prefix: string, fileName: string) => {
  const timestampPrefix = new RegExp(`^${prefix}_(\\d+)_`);
  if (timestampPrefix.test(fileName)) {
    return fileName.replace(timestampPrefix, '');
  }

  const plainPrefix = new RegExp(`^${prefix}_`);
  if (plainPrefix.test(fileName)) {
    return fileName.replace(plainPrefix, '');
  }

  return fileName;
};

export const LegalDocManager = ({ prefix, title }: Props) => {
  const { t } = useLanguage();
  const { roles } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const isAdmin = roles.includes('admin');

  const fetchDocumentRows = useCallback(async () => {
    const { data, error } = await supabase
      .from('legal_documents')
      .select('id, file_name, storage_path, public_url, created_at')
      .eq('prefix', prefix)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(error.message);
      return [];
    }

    return data ?? [];
  }, [prefix]);

  const loadFiles = useCallback(async () => {
    let rows = await fetchDocumentRows();

    if (isAdmin) {
      const { data: storageFiles, error: storageError } = await supabase.storage
        .from('portfolios')
        .list('legal', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

      if (!storageError && storageFiles) {
        const relevantStorageFiles = storageFiles
          .filter((file) => file.name !== '.emptyFolderPlaceholder' && file.name.startsWith(prefix))
          .map((file) => {
            const storagePath = `legal/${file.name}`;
            const { data: urlData } = supabase.storage.from('portfolios').getPublicUrl(storagePath);

            return {
              file_name: getDisplayNameFromStorage(prefix, file.name),
              storage_path: storagePath,
              public_url: urlData.publicUrl,
            };
          });

        const existingPaths = new Set(rows.map((row) => row.storage_path));
        const missingRows = relevantStorageFiles.filter((file) => !existingPaths.has(file.storage_path));

        if (missingRows.length > 0) {
          const { error: syncError } = await supabase.from('legal_documents').insert(
            missingRows.map((file) => ({
              prefix,
              file_name: file.file_name,
              storage_path: file.storage_path,
              public_url: file.public_url,
            })),
          );

          if (!syncError) {
            rows = await fetchDocumentRows();
          } else if (rows.length === 0) {
            setFiles(
              relevantStorageFiles.map((file) => ({
                id: file.storage_path,
                name: file.file_name,
                storagePath: file.storage_path,
                url: file.public_url,
              })),
            );
            return;
          }
        }
      }
    }

    setFiles(
      rows.map((file) => ({
        id: file.id,
        name: file.file_name,
        storagePath: file.storage_path,
        url: file.public_url,
      })),
    );
  }, [fetchDocumentRows, isAdmin, prefix]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = e.target.files;
    if (!uploadFiles?.length) return;

    setLoading(true);

    const results = await Promise.all(
      Array.from(uploadFiles).map(async (file) => {
        const ts = Date.now() + Math.random().toString(36).slice(2, 8);
        const storedFileName = `${prefix}_${ts}_${file.name}`;
        const storagePath = `legal/${storedFileName}`;

        const { error: uploadError } = await supabase.storage.from('portfolios').upload(storagePath, file, {
          upsert: false,
        });

        if (uploadError) {
          toast.error(`${file.name}: ${uploadError.message}`);
          return;
        }

        const { data: urlData } = supabase.storage.from('portfolios').getPublicUrl(storagePath);

        const { error: dbError } = await supabase.from('legal_documents').insert({
          prefix,
          file_name: file.name,
          storage_path: storagePath,
          public_url: urlData.publicUrl,
        });

        if (dbError) {
          toast.error(`${file.name}: ${dbError.message}`);
          await supabase.storage.from('portfolios').remove([storagePath]);
        }
      }),
    );

    if (results.some((result) => result === undefined)) {
      toast.success(t('legal.uploaded'));
    }

    await loadFiles();
    setLoading(false);
    e.target.value = '';
  };

  const handleDelete = async (file: FileItem) => {
    if (!confirm(t('legal.confirmDelete'))) return;

    const [{ error: storageError }, { error: dbError }] = await Promise.all([
      supabase.storage.from('portfolios').remove([file.storagePath]),
      supabase.from('legal_documents').delete().eq('id', file.id),
    ]);

    if (storageError) {
      toast.error(storageError.message);
      return;
    }

    if (dbError) {
      toast.error(dbError.message);
      return;
    }

    toast.success(t('legal.deleted'));
    await loadFiles();
  };

  const handleRename = async (file: FileItem) => {
    if (!newName.trim() || newName === file.name) {
      setRenamingFile(null);
      return;
    }

    const ext = file.name.split('.').pop();
    const finalName = newName.includes('.') ? newName : `${newName}.${ext}`;

    const { error } = await supabase.from('legal_documents').update({ file_name: finalName }).eq('id', file.id);

    if (error) {
      toast.error(error.message);
      return;
    }

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
                  <Upload className="mr-2 h-4 w-4" />
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
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <FileText className="h-5 w-5 shrink-0 text-primary" />

                  {renamingFile === file.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="h-8 text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && handleRename(file)}
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => handleRename(file)}>
                        <Check className="h-4 w-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setRenamingFile(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm text-foreground transition-colors hover:text-primary"
                      >
                        {file.name}
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                      {isAdmin && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setRenamingFile(file.id);
                              setNewName(file.name.replace(/\.[^.]+$/, ''));
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(file)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
              <Construction className="h-16 w-16 text-muted-foreground/50" />
              <h2 className="text-xl font-semibold text-foreground">{t('legal.inDevelopment')}</h2>
              <p className="max-w-md text-muted-foreground">{t('legal.inDevelopmentDesc')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
