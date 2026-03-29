import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useEsekPaturCount } from '@/hooks/useEsekPaturCount';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, FileText, Loader2 } from 'lucide-react';

const DOC_FIELDS = [
  { key: 'passport', labelKey: 'esek.doc.passport' },
  { key: 'teudat_zeut', labelKey: 'esek.doc.teudatZeut' },
  { key: 'address_proof', labelKey: 'esek.doc.addressProof' },
  { key: 'bank_statement', labelKey: 'esek.doc.bankStatement' },
  { key: 'teudat_ole', labelKey: 'esek.doc.teudatOle' },
] as const;

const EsekPaturPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    id_number: '',
    phone: '',
    address: '',
    activity_type: '',
  });

  const [files, setFiles] = useState<Record<string, File | null>>({
    passport: null,
    teudat_zeut: null,
    address_proof: null,
    bank_statement: null,
    teudat_ole: null,
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFile = (key: string, file: File | null) => {
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const uploadFile = async (key: string, file: File) => {
    const ext = file.name.split('.').pop();
    const path = `${user!.id}/${key}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('esek-patur-docs').upload(path, file);
    if (error) throw error;
    return path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.full_name || !form.id_number || !form.phone || !form.address || !form.activity_type) {
      toast.error(t('esek.error.requiredFields'));
      return;
    }

    setLoading(true);
    try {
      const docUrls: Record<string, string | null> = {};
      for (const doc of DOC_FIELDS) {
        const file = files[doc.key];
        if (file) {
          docUrls[`${doc.key}_url`] = await uploadFile(doc.key, file);
        } else {
          docUrls[`${doc.key}_url`] = null;
        }
      }

      const { error } = await supabase.from('esek_patur_applications' as any).insert({
        user_id: user.id,
        full_name: form.full_name,
        id_number: form.id_number,
        phone: form.phone,
        address: form.address,
        activity_type: form.activity_type,
        ...docUrls,
      } as any);

      if (error) throw error;

      toast.success(t('esek.success'));
      navigate('/for-taskers');
    } catch (err: any) {
      toast.error(err.message || t('esek.error.submit'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-12">
      <div className="container max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold text-center">{t('esek.title')}</h1>
        <p className="text-muted-foreground text-center mt-2">{t('esek.subtitle')}</p>

        {/* Promo banner */}
        <div className="mt-6 p-4 rounded-2xl bg-emerald-50 border border-primary/30 text-center">
          <span className="text-2xl">🎉</span>
          <p className="font-semibold text-primary mt-1">{t('esek.promo.title')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('esek.promo.description')}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {/* Personal info */}
          <div className="space-y-4">
            <h2 className="font-semibold text-lg border-b pb-2">{t('esek.section.personal')}</h2>

            <div className="space-y-2">
              <Label>{t('esek.field.fullName')} *</Label>
              <Input value={form.full_name} onChange={(e) => handleChange('full_name', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('esek.field.idNumber')} *</Label>
              <Input value={form.id_number} onChange={(e) => handleChange('id_number', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('esek.field.phone')} *</Label>
              <Input type="tel" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('esek.field.address')} *</Label>
              <Input value={form.address} onChange={(e) => handleChange('address', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('esek.field.activityType')} *</Label>
              <Input value={form.activity_type} onChange={(e) => handleChange('activity_type', e.target.value)} />
            </div>
          </div>

          {/* Documents */}
          <div className="space-y-4">
            <h2 className="font-semibold text-lg border-b pb-2">{t('esek.section.documents')}</h2>

            {DOC_FIELDS.map((doc) => (
              <div key={doc.key} className="space-y-2">
                <Label>{t(doc.labelKey)}</Label>
                <label className="flex items-center gap-3 p-3 border border-dashed rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors">
                  {files[doc.key] ? (
                    <>
                      <FileText className="w-5 h-5 text-primary shrink-0" />
                      <span className="text-sm truncate">{files[doc.key]!.name}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">{t('esek.upload.placeholder')}</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFile(doc.key, e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            ))}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {t('esek.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default EsekPaturPage;
