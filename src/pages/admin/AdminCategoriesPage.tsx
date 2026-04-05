import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import type { Locale } from '@/i18n/translations';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

type Category = Tables<'categories'>;
type CategoryInsert = TablesInsert<'categories'>;
type LocalizedCategoryField = 'name_en' | 'name_ru' | 'name_he';

const localeFieldMap: Record<Locale, LocalizedCategoryField> = {
  en: 'name_en',
  ru: 'name_ru',
  he: 'name_he',
  ar: 'name_en',
};

export default function AdminCategoriesPage() {
  const { t, locale, dir } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  const primaryField = localeFieldMap[locale];
  const primaryLabel = useMemo(() => {
    if (primaryField === 'name_he') return t('admin.categories.hebrew');
    if (primaryField === 'name_ru') return t('admin.categories.russian');
    return t('admin.categories.english');
  }, [primaryField, t]);

  const columns = useMemo(
    () => [
      { key: primaryField, label: primaryLabel },
      ...([
        { key: 'name_en', label: t('admin.categories.english') },
        { key: 'name_ru', label: t('admin.categories.russian') },
        { key: 'name_he', label: t('admin.categories.hebrew') },
      ] as { key: LocalizedCategoryField; label: string }[]).filter((column) => column.key !== primaryField),
    ],
    [primaryField, primaryLabel, t],
  );

  const load = async () => {
    const { data } = await supabase.from('categories').select('*').order('sort_order');
    setCategories(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addCategory = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    const payload: CategoryInsert = { name_en: trimmedName };
    if (primaryField === 'name_ru') payload.name_ru = trimmedName;
    if (primaryField === 'name_he') payload.name_he = trimmedName;

    const { error } = await supabase.from('categories').insert(payload);
    if (error) { toast.error(error.message); return; }
    setNewName('');
    toast.success(t('admin.categories.added'));
    load();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm(t('admin.categories.deleteConfirm'))) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(t('admin.deleted'));
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div dir={dir}>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('admin.categories')} ({categories.length})</h1>
      
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input
          placeholder={t('admin.categories.newPlaceholder')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={addCategory}><Plus className="w-4 h-4 me-1" /> {t('admin.categories.add')}</Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className="text-start">{column.label}</TableHead>
              ))}
              <TableHead className="text-start">{t('admin.categories.icon')}</TableHead>
              <TableHead className="text-start">{t('admin.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                {columns.map((column, index) => (
                  <TableCell key={column.key} className={index === 0 ? 'font-medium text-start' : 'text-start'}>
                    {c[column.key] || c.name_en || '—'}
                  </TableCell>
                ))}
                <TableCell className="text-start">{c.icon || '—'}</TableCell>
                <TableCell className="text-start">
                  <Button variant="ghost" size="icon" onClick={() => deleteCategory(c.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {categories.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {t('admin.categories.empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
