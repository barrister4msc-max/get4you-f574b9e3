import { useEffect, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Download, Eye, FileText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Application {
  id: string;
  user_id: string;
  full_name: string;
  id_number: string;
  phone: string;
  address: string;
  activity_type: string;
  passport_url: string | null;
  teudat_zeut_url: string | null;
  address_proof_url: string | null;
  bank_statement_url: string | null;
  teudat_ole_url: string | null;
  status: string;
  created_at: string;
}

const DOC_KEYS = [
  { key: 'passport_url', label: 'esek.doc.passport' },
  { key: 'teudat_zeut_url', label: 'esek.doc.teudatZeut' },
  { key: 'address_proof_url', label: 'esek.doc.addressProof' },
  { key: 'bank_statement_url', label: 'esek.doc.bankStatement' },
  { key: 'teudat_ole_url', label: 'esek.doc.teudatOle' },
] as const;

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const AdminEsekPatur = () => {
  const { t } = useLanguage();
  const { user, roles } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);

  const isAdmin = roles.includes('admin');

  useEffect(() => {
    if (!isAdmin) return;
    loadApplications();
  }, [isAdmin]);

  const loadApplications = async () => {
    const { data, error } = await supabase
      .from('esek_patur_applications' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setApps(data as any);
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('esek_patur_applications' as any)
      .update({ status } as any)
      .eq('id', id);
    if (error) {
      toast.error(t('admin.esek.error.update'));
    } else {
      toast.success(t('admin.esek.statusUpdated'));
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    }
  };

  const getDocUrl = async (path: string) => {
    const { data } = await supabase.storage.from('esek-patur-docs').createSignedUrl(path, 3600);
    return data?.signedUrl;
  };

  const openDoc = async (path: string) => {
    const url = await getDocUrl(path);
    if (url) window.open(url, '_blank');
  };

  if (!isAdmin) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">{t('admin.esek.accessDenied')}</h1>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="container max-w-5xl">
        <h1 className="text-2xl md:text-3xl font-bold">{t('admin.esek.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('admin.esek.subtitle')}</p>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : apps.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">{t('admin.esek.empty')}</p>
        ) : (
          <div className="mt-6 space-y-4">
            {apps.map((app) => (
              <div key={app.id} className="border rounded-xl p-5 bg-card shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-lg">{app.full_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('esek.field.idNumber')}: {app.id_number} · {t('esek.field.phone')}: {app.phone}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('esek.field.address')}: {app.address} · {t('esek.field.activityType')}: {app.activity_type}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(app.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={statusColors[app.status] || 'bg-muted'}>{app.status}</Badge>
                    <Select value={app.status} onValueChange={(v) => updateStatus(app.id, v)}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">{t('admin.esek.status.pending')}</SelectItem>
                        <SelectItem value="approved">{t('admin.esek.status.approved')}</SelectItem>
                        <SelectItem value="rejected">{t('admin.esek.status.rejected')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setSelected(app)}>
                      <Eye className="w-4 h-4 mr-1" /> {t('admin.esek.viewDocs')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document viewer dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.full_name} — {t('esek.section.documents')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {DOC_KEYS.map((doc) => {
              const path = selected?.[doc.key as keyof Application] as string | null;
              return (
                <div key={doc.key} className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium">{t(doc.label)}</span>
                  {path ? (
                    <Button size="sm" variant="ghost" onClick={() => openDoc(path)}>
                      <Download className="w-4 h-4 mr-1" /> {t('admin.esek.open')}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('admin.esek.noFile')}</span>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEsekPatur;
