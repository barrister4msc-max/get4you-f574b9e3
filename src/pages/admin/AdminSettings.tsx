import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { MessageSquare, FileText, Briefcase, Shield, ScrollText, UserPlus, Loader2, CheckCircle } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const settingsLinks = [
  { to: '/admin/broadcast', label: 'WhatsApp Рассылка', icon: MessageSquare, desc: 'Отправка массовых сообщений исполнителям' },
  { to: '/admin/esek-patur', label: 'Осек Патур', icon: FileText, desc: 'Управление заявками Осек Патур' },
  { to: '/admin/employment', label: 'Трудовые договоры', icon: Briefcase, desc: 'Управление трудовыми договорами' },
  { to: '/terms', label: 'Terms of Service', icon: ScrollText, desc: 'Загрузка и обновление условий использования' },
  { to: '/privacy', label: 'Privacy Policy', icon: Shield, desc: 'Загрузка и обновление политики конфиденциальности' },
];

export default function AdminSettings() {
  const { t } = useLanguage();
  const [adminEmail, setAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);

  const handleAddAdmin = async () => {
    if (!adminEmail.trim()) return;
    setAddingAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', {
        body: { email: adminEmail.trim().toLowerCase() },
      });

      if (error) {
        toast.error('Ошибка: ' + error.message);
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`${data.display_name || adminEmail} назначен администратором`);
        setAdminEmail('');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingAdmin(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('admin.settings')}</h1>

      {/* Add Admin Section */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <UserPlus className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Добавить администратора</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Введите email зарегистрированного пользователя, чтобы назначить его администратором.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="user@example.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAdmin()}
              className="max-w-xs"
            />
            <Button onClick={handleAddAdmin} disabled={addingAdmin || !adminEmail.trim()} size="sm">
              {addingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              Назначить
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {settingsLinks.map((s) => (
          <Link key={s.to} to={s.to}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <s.icon className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">{s.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
