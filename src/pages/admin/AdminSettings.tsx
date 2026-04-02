import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { MessageSquare, FileText, Briefcase } from 'lucide-react';

const settingsLinks = [
  { to: '/admin/broadcast', label: 'WhatsApp Рассылка', icon: MessageSquare, desc: 'Отправка массовых сообщений исполнителям' },
  { to: '/admin/esek-patur', label: 'Осек Патур', icon: FileText, desc: 'Управление заявками Осек Патур' },
  { to: '/admin/employment', label: 'Трудовые договоры', icon: Briefcase, desc: 'Управление трудовыми договорами' },
];

export default function AdminSettings() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Настройки</h1>
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
