import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { streamChat } from '@/lib/streamChat';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Headphones, Bot, Send } from 'lucide-react';
import { toast } from 'sonner';

type Msg = { role: 'user' | 'assistant'; content: string };

export const SupportDialog = () => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chat');

  // Form state
  const [name, setName] = useState(profile?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    await new Promise(r => setTimeout(r, 1000));
    toast.success(t('support.sent'));
    setSubject('');
    setMessage('');
    setOpen(false);
    setSending(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: Msg = { role: 'user', content: chatInput };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setChatInput('');
    setChatLoading(true);

    let assistantSoFar = '';
    const updateAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    await streamChat({
      functionName: 'ai-support-chat',
      messages: allMessages,
      onDelta: updateAssistant,
      onDone: () => setChatLoading(false),
      onError: (err) => {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err}` }]);
        setChatLoading(false);
      },
    });
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

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chat" className="gap-1.5">
                <Bot className="w-4 h-4" />
                {t('support.chat')}
              </TabsTrigger>
              <TabsTrigger value="form" className="gap-1.5">
                <Headphones className="w-4 h-4" />
                {t('support.form')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="mt-4">
              <div ref={scrollRef} className="h-64 overflow-y-auto space-y-2 mb-3 p-1">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t('support.chat.hint') || 'Ask me anything about the platform!'}
                  </p>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] text-sm px-3 py-2 rounded-xl whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                  <div className="flex justify-start">
                    <div className="bg-muted text-muted-foreground text-sm px-3 py-2 rounded-xl animate-pulse">…</div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                  placeholder={t('support.message') || 'Type a message...'}
                  className="flex-1"
                />
                <Button size="icon" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="form" className="mt-4">
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
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
};
