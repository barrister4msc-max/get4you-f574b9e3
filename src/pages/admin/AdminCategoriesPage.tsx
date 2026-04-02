import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  const load = async () => {
    const { data } = await supabase.from('categories').select('*').order('sort_order');
    setCategories(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addCategory = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('categories').insert({ name_en: newName.trim() });
    if (error) { toast.error(error.message); return; }
    setNewName('');
    toast.success('Категория добавлена');
    load();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Удалить категорию?')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Удалено');
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Категории ({categories.length})</h1>
      
      <div className="flex gap-2 mb-4">
        <Input placeholder="Новая категория" value={newName} onChange={(e) => setNewName(e.target.value)} className="max-w-xs" />
        <Button onClick={addCategory}><Plus className="w-4 h-4 mr-1" /> Добавить</Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>EN</TableHead>
              <TableHead>RU</TableHead>
              <TableHead>HE</TableHead>
              <TableHead>Иконка</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name_en}</TableCell>
                <TableCell>{c.name_ru || '—'}</TableCell>
                <TableCell>{c.name_he || '—'}</TableCell>
                <TableCell>{c.icon || '—'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => deleteCategory(c.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
