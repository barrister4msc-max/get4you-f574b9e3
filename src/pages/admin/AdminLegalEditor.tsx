import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, Upload, FileText, Trash2, ExternalLink, Save } from 'lucide-react';

const SLUGS = ['privacy', 'terms'] as const;
const LANGS = ['en', 'ru', 'he'] as const;
type Slug = (typeof SLUGS)[number];
type Lang = (typeof LANGS)[number];

interface PageRow {
  slug: Slug;
  title_en: string; title_ru: string; title_he: string;
  meta_en: string; meta_ru: string; meta_he: string;
  h1_en: string; h1_ru: string; h1_he: string;
  content_en: string; content_ru: string; content_he: string;
  is_published: boolean;
}

interface FileRow {
  id: string;
  file_name: string;
  public_url: string;
  storage_path: string;
}

const safeStoragePath = (slug: string, originalName: string) => {
  const m = originalName.match(/\.([^.]+)$/);
  const ext = m ? `.${m[1].toLowerCase()}` : '';
  const base = (ext ? originalName.slice(0, -ext.length) : originalName)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'document';
  return `legal/${slug}_${Date.now()}_${base}${ext}`;
};

export default function AdminLegalEditor() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes('admin') || roles.includes('super_admin') || roles.includes('superadmin');
  const [slug, setSlug] = useState<Slug>('privacy');
  const [row, setRow] = useState<PageRow | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: page }, { data: filesData }] = await Promise.all([
      supabase.from('seo_pages').select('*').eq('slug', slug).maybeSingle(),
      supabase.from('legal_documents').select('id,file_name,public_url,storage_path').eq('prefix', slug).order('created_at', { ascending: false }),
    ]);
    setRow((page as any) ?? null);
    setFiles((filesData as any) ?? []);
    setLoading(false);
  }, [slug]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const updateField = (field: keyof PageRow, value: any) => {
    setRow((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const save = async () => {
    if (!row) return;
    setSaving(true);
    const { error } = await supabase.from('seo_pages').update({
      title_en: row.title_en, title_ru: row.title_ru, title_he: row.title_he,
      meta_en: row.meta_en, meta_ru: row.meta_ru, meta_he: row.meta_he,
      h1_en: row.h1_en, h1_ru: row.h1_ru, h1_he: row.h1_he,
      content_en: row.content_en, content_ru: row.content_ru, content_he: row.content_he,
      is_published: row.is_published,
    }).eq('slug', slug);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Saved');
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const path = safeStoragePath(slug, file.name);
    const { error: upErr } = await supabase.storage.from('portfolios').upload(path, file, { upsert: false });
    if (upErr) {
      toast.error(upErr.message);
      setUploading(false);
      e.target.value = '';
      return;
    }
    const { data: urlData } = supabase.storage.from('portfolios').getPublicUrl(path);
    const { error: dbErr } = await supabase.from('legal_documents').insert({
      prefix: slug,
      file_name: file.name,
      storage_path: path,
      public_url: urlData.publicUrl,
      uploaded_by: user.id,
    });
    if (dbErr) {
      toast.error(dbErr.message);
      await supabase.storage.from('portfolios').remove([path]);
    } else {
      toast.success('Uploaded');
      await load();
    }
    setUploading(false);
    e.target.value = '';
  };

  const deleteFile = async (f: FileRow) => {
    if (!confirm(`Delete ${f.file_name}?`)) return;
    const [{ error: sErr }, { error: dErr }] = await Promise.all([
      supabase.storage.from('portfolios').remove([f.storage_path]),
      supabase.from('legal_documents').delete().eq('id', f.id),
    ]);
    if (sErr || dErr) toast.error((sErr || dErr)!.message);
    else { toast.success('Deleted'); load(); }
  };

  if (!isAdmin) return <div className="py-16 text-center"><h1 className="text-2xl font-bold">Access denied</h1></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Legal pages editor</h1>

      <Tabs value={slug} onValueChange={(v) => setSlug(v as Slug)}>
        <TabsList>
          {SLUGS.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>
          ))}
        </TabsList>

        {SLUGS.map((s) => (
          <TabsContent key={s} value={s} className="space-y-6 mt-6">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : !row ? (
              <p className="text-muted-foreground">Row not found.</p>
            ) : (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Content (/{slug})</CardTitle>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.is_published}
                          onChange={(e) => updateField('is_published', e.target.checked)}
                        />
                        Published
                      </label>
                      <Button size="sm" onClick={save} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                        Save
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="en">
                      <TabsList>
                        {LANGS.map((l) => (
                          <TabsTrigger key={l} value={l}>{l.toUpperCase()}</TabsTrigger>
                        ))}
                      </TabsList>
                      {LANGS.map((l) => (
                        <TabsContent key={l} value={l} className="space-y-3 mt-4">
                          <div>
                            <Label>Title ({l})</Label>
                            <Input
                              value={(row as any)[`title_${l}`] || ''}
                              onChange={(e) => updateField(`title_${l}` as any, e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Meta description ({l})</Label>
                            <Input
                              value={(row as any)[`meta_${l}`] || ''}
                              onChange={(e) => updateField(`meta_${l}` as any, e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>H1 ({l})</Label>
                            <Input
                              value={(row as any)[`h1_${l}`] || ''}
                              onChange={(e) => updateField(`h1_${l}` as any, e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Content HTML ({l})</Label>
                            <Textarea
                              rows={16}
                              className="font-mono text-xs"
                              value={(row as any)[`content_${l}`] || ''}
                              onChange={(e) => updateField(`content_${l}` as any, e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              HTML is sanitized on render. Allowed: headings, paragraphs, lists, links, basic formatting.
                            </p>
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Attached files</CardTitle>
                    <label>
                      <Button size="sm" variant="outline" disabled={uploading} asChild>
                        <span className="cursor-pointer">
                          {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                          Upload file
                          <input type="file" className="hidden" onChange={onUpload} accept=".pdf,.doc,.docx,.txt,.html,.md" />
                        </span>
                      </Button>
                    </label>
                  </CardHeader>
                  <CardContent>
                    {files.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No files uploaded.</p>
                    ) : (
                      <ul className="space-y-2">
                        {files.map((f) => (
                          <li key={f.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                            <a
                              href={f.public_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm hover:text-primary truncate"
                            >
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="truncate">{f.file_name}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                            </a>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteFile(f)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}