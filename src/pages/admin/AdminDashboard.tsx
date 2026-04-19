import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, Users, Wrench, DollarSign } from 'lucide-react';

export default function AdminDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ tasks: 0, todayTasks: 0, activeTaskers: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [tasksRes, todayRes, taskersRes, escrowRes] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('created_at', today),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('role', 'executor'),
        supabase.from('escrow_transactions').select('commission_amount').eq('status', 'released'),
      ]);
      const revenue = (escrowRes.data || []).reduce((sum, r) => sum + Number(r.commission_amount), 0);
      setStats({ tasks: tasksRes.count ?? 0, todayTasks: todayRes.count ?? 0, activeTaskers: taskersRes.count ?? 0, revenue });
      setLoading(false);
    };
    load();
  }, []);

  const cards = [
    { title: t('admin.totalOrders'), value: stats.tasks, icon: ClipboardList, color: 'text-primary', link: '/admin/orders' },
    { title: t('admin.newToday'), value: stats.todayTasks, icon: ClipboardList, color: 'text-accent-foreground', link: '/admin/orders' },
    { title: t('admin.taskersCount'), value: stats.activeTaskers, icon: Wrench, color: 'text-primary', link: '/admin/taskers' },
    { title: t('admin.revenue'), value: `₪ ${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-primary', link: '/admin/orders' },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('admin.dashboard')}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card
            key={c.title}
            className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
            onClick={() => navigate(c.link)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
