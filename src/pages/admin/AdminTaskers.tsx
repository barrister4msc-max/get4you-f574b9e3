import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function AdminTaskers() {
  const [taskers, setTaskers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'tasker');
      const taskerIds = (roles || []).map((r) => r.user_id);
      if (taskerIds.length === 0) { setLoading(false); return; }

      const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', taskerIds);
      
      // Get review averages and task counts
      const { data: reviews } = await supabase.from('reviews').select('reviewee_id, rating');
      const { data: tasks } = await supabase.from('tasks').select('assigned_to').not('assigned_to', 'is', null);

      const merged = (profiles || []).map((p) => {
        const userReviews = (reviews || []).filter((r) => r.reviewee_id === p.user_id);
        const avgRating = userReviews.length > 0 ? (userReviews.reduce((s, r) => s + r.rating, 0) / userReviews.length).toFixed(1) : '—';
        const taskCount = (tasks || []).filter((t) => t.assigned_to === p.user_id).length;
        return { ...p, avgRating, taskCount, reviewCount: userReviews.length };
      });

      setTaskers(merged);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Исполнители ({taskers.length})</h1>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Город</TableHead>
              <TableHead>Рейтинг</TableHead>
              <TableHead>Заказов</TableHead>
              <TableHead>Телефон</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {taskers.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.display_name || '—'}</TableCell>
                <TableCell>{t.city || '—'}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t.avgRating} ⭐ ({t.reviewCount})</Badge>
                </TableCell>
                <TableCell>{t.taskCount}</TableCell>
                <TableCell className="text-muted-foreground">{t.phone || '—'}</TableCell>
              </TableRow>
            ))}
            {taskers.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Нет исполнителей</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
