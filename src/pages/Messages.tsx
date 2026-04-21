import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Send, Shield, MessageSquare, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DM {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
}

interface Thread {
  otherId: string;
  otherName: string;
  lastContent: string;
  lastAt: string;
}

export default function Messages() {
  const { user } = useAuth();
  const { t, dir } = useLanguage();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DM[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: rows } = await supabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, content, created_at')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    const map = new Map<string, Thread>();
    for (const r of (rows ?? []) as DM[]) {
      const otherId = r.sender_id === user.id ? r.recipient_id : r.sender_id;
      if (!map.has(otherId)) {
        map.set(otherId, { otherId, otherName: 'Admin', lastContent: r.content, lastAt: r.created_at });
      }
    }

    const ids = [...map.keys()];
    if (ids.length) {
      const { data: profiles } = await supabase.rpc('get_public_profiles', { target_user_ids: ids });
      profiles?.forEach((p: any) => {
        const t = map.get(p.user_id);
        if (t) t.otherName = p.display_name || 'Admin';
      });
    }

    const list = [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    setThreads(list);
    setSelectedId((prev) => prev ?? list[0]?.otherId ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const loadMessages = useCallback(async (otherId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, content, created_at')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    setMessages((data as DM[]) ?? []);

    // mark notifications related to admin DMs as read
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', user.id).eq('is_read', false)
      .in('type', ['admin_dm', 'direct_message']);
  }, [user]);

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);

    const channel = supabase
      .channel(`user-dm-${user?.id}-${selectedId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        const m = payload.new as DM;
        const involves =
          (m.sender_id === user?.id && m.recipient_id === selectedId) ||
          (m.sender_id === selectedId && m.recipient_id === user?.id);
        if (involves) setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedId, user?.id, loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!draft.trim() || !user || !selectedId || sending) return;
    setSending(true);
    const content = draft.trim();
    setDraft('');
    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ sender_id: user.id, recipient_id: selectedId, content })
      .select('id, sender_id, recipient_id, content, created_at')
      .single();
    if (error) {
      console.error('DM send error:', error);
      toast.error(`${t('chat.sendError') || 'Send failed'}: ${error.message}`);
      setDraft(content);
    } else if (data) {
      // Optimistic local append in case realtime delivery is delayed
      setMessages((prev) => prev.some((x) => x.id === data.id) ? prev : [...prev, data as DM]);
    }
    setSending(false);
  };

  if (!user) return null;
  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const selectedThread = threads.find((t) => t.otherId === selectedId);

  return (
    <div dir={dir} className="container max-w-5xl py-6">
      <h1 className="text-2xl font-bold mb-4 text-foreground">{t('messages.title') || 'Сообщения'}</h1>
      {threads.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t('messages.empty') || 'У вас пока нет сообщений от администратора'}</p>
        </div>
      ) : (
        <div className="flex border border-border rounded-lg bg-card overflow-hidden" style={{ height: 'calc(100vh - 14rem)' }}>
          <div className={cn('w-72 border-e border-border overflow-y-auto shrink-0', selectedId && 'hidden md:block')}>
            {threads.map((th) => (
              <button
                key={th.otherId}
                onClick={() => setSelectedId(th.otherId)}
                className={cn('w-full text-start px-4 py-3 border-b border-border hover:bg-secondary/50 transition-colors',
                  selectedId === th.otherId && 'bg-primary/5')}
              >
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  {th.otherName}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-1">{th.lastContent}</p>
              </button>
            ))}
          </div>

          <div className={cn('flex-1 flex flex-col', !selectedId && 'hidden md:flex')}>
            {selectedThread && (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                  <button className="md:hidden text-muted-foreground" onClick={() => setSelectedId(null)}>
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <Shield className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-sm text-foreground">{selectedThread.otherName}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                  {messages.map((m) => {
                    const mine = m.sender_id === user.id;
                    return (
                      <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div className={cn('max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                          mine ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground')}>
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <p className={cn('text-[10px] mt-1', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
                <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder={t('chat.placeholder') || 'Type a message...'}
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || sending}
                    className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
