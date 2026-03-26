import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Headphones } from 'lucide-react';
import { toast } from 'sonner';

export const SupportDialog = () => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    // Simulate sending — in production connect to edge function or email service
    await new Promise(r => setTimeout(r, 1000));
    toast.success(t('support.sent'));
    setSubject('');
    setMessage('');
    setOpen(false);
    setSending(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label={t('support.title')}
      >
        <Headphones className="w-6 h-6" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('support.title')}</DialogTitle>
            <DialogDescription>{t('support.subtitle')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>{t('support.name')}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <Label>{t('support.email')}</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label>{t('support.subject')}</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} required />
            </div>
            <div>
              <Label>{t('support.message')}</Label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} required />
            </div>
            <Button type="submit" className="w-full" disabled={sending}>
              {t('support.send')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
