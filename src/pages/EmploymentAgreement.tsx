import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FileSignature, Loader2, CheckCircle2, Upload, FileText } from 'lucide-react';
import FileOrPhotoInput from '@/components/FileOrPhotoInput';

const AGREEMENT_VERSION = '1.0';

const DOC_FIELDS = [
  { key: 'passport', labelKey: 'esek.doc.passport', required: true },
  { key: 'teudat_zeut', labelKey: 'esek.doc.teudatZeut', required: true },
  { key: 'address_proof', labelKey: 'esek.doc.addressProof', required: false },
  { key: 'bank_statement', labelKey: 'esek.doc.bankStatement', required: false },
  { key: 'teudat_ole', labelKey: 'esek.doc.teudatOle', required: false },
] as const;

const EmploymentAgreementPage = () => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'loading' | 'none' | 'pending' | 'approved' | 'signed'>('loading');

  const [form, setForm] = useState({
    full_name: '',
    id_number: '',
    phone: '',
    address: '',
  });

  const [files, setFiles] = useState<Record<string, File | null>>({
    passport: null,
    teudat_zeut: null,
    address_proof: null,
    bank_statement: null,
    teudat_ole: null,
  });

  const [agreed, setAgreed] = useState(false);
  const [confirmedRead, setConfirmedRead] = useState(false);

  useEffect(() => {
    if (profile?.display_name) setForm(f => ({ ...f, full_name: profile.display_name || '' }));
    if (profile?.phone) setForm(f => ({ ...f, phone: profile.phone || '' }));
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data } = await supabase
        .from('employment_agreements' as any)
        .select('id, status, signed_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!data || data.length === 0) {
        setStatus('none');
      } else {
        const agreement = data[0] as any;
        if (agreement.signed_at) {
          setStatus('signed');
        } else if (agreement.status === 'approved') {
          setStatus('approved');
        } else {
          setStatus('pending');
        }
      }
    };
    check();
  }, [user]);

  const uploadFile = async (key: string, file: File) => {
    const ext = file.name.split('.').pop();
    const path = `${user!.id}/${key}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('employment-docs').upload(path, file);
    if (error) throw error;
    return path;
  };

  const handleSubmitDocs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.full_name || !form.id_number || !form.phone || !form.address) {
      toast.error(t('esek.error.requiredFields'));
      return;
    }

    if (!files.passport || !files.teudat_zeut) {
      toast.error(t('employment.error.requiredDocs'));
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

      const { error } = await supabase.from('employment_agreements' as any).insert({
        user_id: user.id,
        full_name: form.full_name,
        id_number: form.id_number,
        phone: form.phone,
        address: form.address,
        ...docUrls,
      } as any);

      if (error) throw error;
      toast.success(t('employment.docs.success'));
      setStatus('pending');
    } catch (err: any) {
      toast.error(err.message || t('esek.error.submit'));
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!user) return;
    if (!agreed || !confirmedRead) {
      toast.error(t('contract.error.agree'));
      return;
    }

    setLoading(true);
    try {
      // Get the approved agreement
      const { data } = await supabase
        .from('employment_agreements' as any)
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .limit(1);

      if (!data || data.length === 0) {
        toast.error(t('employment.error.noApproved'));
        return;
      }

      const { error } = await supabase
        .from('employment_agreements' as any)
        .update({
          signed_at: new Date().toISOString(),
          agreement_version: AGREEMENT_VERSION,
          user_agent: navigator.userAgent,
        } as any)
        .eq('id', (data[0] as any).id);

      if (error) throw error;
      toast.success(t('contract.success'));
      setStatus('signed');
    } catch (err: any) {
      toast.error(err.message || t('contract.error.submit'));
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'signed') {
    return (
      <div className="py-12">
        <div className="container max-w-2xl text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{t('employment.signed.title')}</h1>
          <p className="text-muted-foreground">{t('employment.signed.description')}</p>
          <Button onClick={() => navigate('/profile')} variant="outline">
            {t('contract.signed.back')}
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="py-12">
        <div className="container max-w-2xl text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <FileSignature className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold">{t('employment.pending.title')}</h1>
          <p className="text-muted-foreground">{t('employment.pending.description')}</p>
          <Button onClick={() => navigate('/profile')} variant="outline">
            {t('contract.signed.back')}
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="py-8 md:py-12">
        <div className="container max-w-3xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <FileSignature className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">{t('employment.sign.title')}</h1>
            <p className="text-muted-foreground mt-2">{t('employment.sign.subtitle')}</p>
          </div>

          <div className="mt-6 p-6 rounded-2xl border bg-card max-h-[60vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-line">
            {t('employment.agreementPlaceholder')}
          </div>

          <div className="mt-8 space-y-5">
            <div className="flex items-start gap-3">
              <Checkbox
                id="read"
                checked={confirmedRead}
                onCheckedChange={(v) => setConfirmedRead(v === true)}
              />
              <label htmlFor="read" className="text-sm cursor-pointer">
                {t('employment.checkbox.read')}
              </label>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="agree"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
              />
              <label htmlFor="agree" className="text-sm cursor-pointer">
                {t('employment.checkbox.agree')}
              </label>
            </div>

            <p className="text-xs text-muted-foreground italic">
              {t('contract.legal.note')}
            </p>

            <Button onClick={handleSign} disabled={loading} className="w-full">
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <FileSignature className="w-4 h-4 mr-2" />
              {t('employment.sign.button')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // status === 'none' — show document upload form
  return (
    <div className="py-8 md:py-12">
      <div className="container max-w-2xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <FileSignature className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">{t('employment.title')}</h1>
          <p className="text-muted-foreground mt-2">{t('employment.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmitDocs} className="mt-8 space-y-6">
          <div className="space-y-4">
            <h2 className="font-semibold text-lg border-b pb-2">{t('esek.section.personal')}</h2>

            <div className="space-y-2">
              <Label>{t('esek.field.fullName')} *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>{t('esek.field.idNumber')} *</Label>
              <Input value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>{t('esek.field.phone')} *</Label>
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>{t('esek.field.address')} *</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="font-semibold text-lg border-b pb-2">{t('esek.section.documents')}</h2>

            {DOC_FIELDS.map((doc) => (
              <div key={doc.key} className="space-y-2">
                <Label>
                  {t(doc.labelKey)}
                  {doc.required ? ' *' : ` (${t('employment.optional')})`}
                </Label>
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
                    onChange={(e) => setFiles({ ...files, [doc.key]: e.target.files?.[0] ?? null })}
                  />
                </label>
              </div>
            ))}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {t('employment.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default EmploymentAgreementPage;
