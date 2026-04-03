import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { exportToCsv } from '@/lib/exportCsv';

export default function AdminReviews() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
    // Fetch profile names
    const userIds = [...new Set((data || []).flatMap((r) => [r.reviewer_id, r.reviewee_id]))];
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
    const nameMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p.display_name]));

    setReviews((data || []).map((r) => ({ ...r, reviewerName: nameMap[r.reviewer_id] || '—', revieweeName: nameMap[r.reviewee_id] || '—' })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const deleteReview = async (id: string) => {
    if (!confirm('Удалить отзыв?')) return;
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Удалено');
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Отзывы ({reviews.length})</h1>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>От кого</TableHead>
              <TableHead>Кому</TableHead>
              <TableHead>Оценка</TableHead>
              <TableHead>Текст</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.reviewerName}</TableCell>
                <TableCell>{r.revieweeName}</TableCell>
                <TableCell>{'⭐'.repeat(r.rating)}</TableCell>
                <TableCell className="max-w-[200px] truncate">{r.comment || '—'}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{format(new Date(r.created_at), 'dd.MM.yy')}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => deleteReview(r.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {reviews.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Нет отзывов</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
