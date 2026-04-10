import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, X, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Suggestion {
  id: string;
  suggested_name: string;
  suggested_name_ru: string | null;
  suggested_name_he: string | null;
  description: string | null;
  match_count: number;
  status: string;
  created_at: string;
}

export default function AdminCategorySuggestions() {
  const { t, dir } = useLanguage();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('category_suggestions')
      .select('*')
      .order('created_at', { ascending: false });
    setSuggestions((data as Suggestion[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-categories');
      if (error) throw error;
      toast.success(data?.message ?? t('admin.categorySuggestions.analyzed'));
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Analysis failed');
    }
    setAnalyzing(false);
  };

  const approveSuggestion = async (s: Suggestion) => {
    // Create the category
    const { error: catError } = await supabase.from('categories').insert({
      name_en: s.suggested_name,
      name_ru: s.suggested_name_ru,
      name_he: s.suggested_name_he,
    });
    if (catError) { toast.error(catError.message); return; }

    // Mark suggestion as approved
    const { error } = await supabase
      .from('category_suggestions')
      .update({ status: 'approved' })
      .eq('id', s.id);
    if (error) { toast.error(error.message); return; }

    toast.success(t('admin.categorySuggestions.approved'));
    load();
  };

  const rejectSuggestion = async (id: string) => {
    const { error } = await supabase
      .from('category_suggestions')
      .update({ status: 'rejected' })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(t('admin.categorySuggestions.rejected'));
    load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pending = suggestions.filter(s => s.status === 'pending');
  const resolved = suggestions.filter(s => s.status !== 'pending');

  return (
    <div dir={dir} className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">{t('admin.categorySuggestions.title')}</h2>
        <Button onClick={runAnalysis} disabled={analyzing} variant="outline" size="sm">
          {analyzing ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Sparkles className="w-4 h-4 me-2" />}
          {t('admin.categorySuggestions.analyze')}
        </Button>
      </div>

      {pending.length === 0 && resolved.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">{t('admin.categorySuggestions.empty')}</p>
      )}

      {pending.length > 0 && (
        <div className="rounded-lg border border-border bg-card mb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">{t('admin.categorySuggestions.name')}</TableHead>
                <TableHead className="text-start">{t('admin.categorySuggestions.description')}</TableHead>
                <TableHead className="text-start">{t('admin.categorySuggestions.matches')}</TableHead>
                <TableHead className="text-start">{t('admin.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-start">
                    <div>{s.suggested_name}</div>
                    {s.suggested_name_ru && <div className="text-xs text-muted-foreground">{s.suggested_name_ru}</div>}
                    {s.suggested_name_he && <div className="text-xs text-muted-foreground">{s.suggested_name_he}</div>}
                  </TableCell>
                  <TableCell className="text-start text-sm">{s.description ?? '—'}</TableCell>
                  <TableCell className="text-start">
                    <Badge variant="secondary">{s.match_count}</Badge>
                  </TableCell>
                  <TableCell className="text-start">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => approveSuggestion(s)} title="Approve">
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => rejectSuggestion(s.id)} title="Reject">
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {resolved.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-muted-foreground cursor-pointer">{t('admin.categorySuggestions.history')} ({resolved.length})</summary>
          <div className="rounded-lg border border-border bg-card mt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t('admin.categorySuggestions.name')}</TableHead>
                  <TableHead className="text-start">{t('admin.status')}</TableHead>
                  <TableHead className="text-start">{t('admin.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolved.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-start">{s.suggested_name}</TableCell>
                    <TableCell className="text-start">
                      <Badge variant={s.status === 'approved' ? 'default' : 'destructive'}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-start text-sm">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}
    </div>
  );
}
