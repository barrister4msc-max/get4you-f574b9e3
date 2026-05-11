import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { MessageSquare, FileText, Briefcase, Shield, ScrollText, UserPlus, Loader2, CheckCircle, FileEdit } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function AdminSettings() {
  const { t } = useLanguage();
  const { isSuperAdmin } = useAuth();
  const [adminEmail, setAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);

  const settingsLinks = [
    { to: '/admin/broadcast', label: t('admin.settings.broadcast'), icon: MessageSquare, desc: t('admin.settings.broadcastDesc') },
    { to: '/admin/esek-patur', label: t('admin.settings.esek'), icon: FileText, desc: t('admin.settings.esekDesc') },
    { to: '/admin/employment', label: t('admin.settings.employment'), icon: Briefcase, desc: t('admin.settings.employmentDesc') },
    { to: '/admin/legal', label: 'Legal pages editor', icon: FileEdit, desc: 'Edit Privacy and Terms content + attached files.' },
    { to: '/terms', label: t('admin.settings.terms'), icon: ScrollText, desc: t('admin.settings.termsDesc') },
    { to: '/privacy', label: t('admin.settings.privacy'), icon: Shield, desc: t('admin.settings.privacyDesc') },
  ];

  const handleAddAdmin = async () => {
    if (!adminEmail.trim()) return;
    setAddingAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-admin', {
        body: { email: adminEmail.trim().toLowerCase(), action: 'add', role: 'admin' },
      });

      if (error) {
        toast.error(t('admin.settings.errorPrefix') + error.message);
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(t('admin.settings.assignedToast').replace('{name}', data.display_name || adminEmail));
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

      {/* Add Admin Section - only for super_admin */}
      {isSuperAdmin && (
        <Card className="mb-6 border-primary/20">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">{t('admin.settings.addAdmin')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {t('admin.settings.addAdminDesc')}
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
                {t('admin.settings.assign')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
