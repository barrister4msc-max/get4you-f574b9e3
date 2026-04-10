import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Search, MessageSquare, User, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Conversation {
  key: string;
  task_id: string;
  task_title: string;
  participant_id: string;
  participant_name: string | null;
  participant_role: 'client' | 'tasker';
  last_message: string | null;
  last_message_at: string | null;
}

interface Message {
  id: string;
  task_id: string;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  created_at: string;
}

export default function AdminChat() {
  const { user } = useAuth();
  const { t, dir } = useLanguage();
  const [searchParams] = useSearchParams();
  const filterUserId = searchParams.get('user');
  const preselectedTask = searchParams.get('task');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedConvo = conversations.find(c => c.key === selectedKey) ?? null;

  const loadConversations = useCallback(async () => {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, user_id, assigned_to, status')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!tasks?.length) { setConversations([]); setLoading(false); return; }

    // Get proposals to find taskers who responded
    const { data: proposals } = await supabase
      .from('proposals')
      .select('task_id, user_id')
      .in('task_id', tasks.map(t => t.id));

    // Build tasker map per task: assigned_to + all proposers
    const taskTaskersMap = new Map<string, Set<string>>();
    for (const task of tasks) {
      const taskers = new Set<string>();
      if (task.assigned_to) taskers.add(task.assigned_to);
      taskTaskersMap.set(task.id, taskers);
    }
    for (const p of (proposals ?? [])) {
      const set = taskTaskersMap.get(p.task_id);
      if (set && p.user_id !== tasks.find(t => t.id === p.task_id)?.user_id) {
        set.add(p.user_id);
      }
    }

    const allUserIds = new Set<string>();
    tasks.forEach(t => { allUserIds.add(t.user_id); });
    taskTaskersMap.forEach(set => set.forEach(id => allUserIds.add(id)));

    const { data: profiles } = await supabase.rpc('get_public_profiles', { target_user_ids: [...allUserIds] });
    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) ?? []);

    const { data: allMessages } = await supabase
      .from('chat_messages')
      .select('task_id, content, created_at, sender_id, recipient_id')
      .in('task_id', tasks.map(t => t.id))
      .order('created_at', { ascending: false });

    const lastMsgMap = new Map<string, { content: string; created_at: string }>();
    allMessages?.forEach(m => {
      const participantId = m.recipient_id ?? m.sender_id;
      const key = `${m.task_id}__${participantId}`;
      if (!lastMsgMap.has(key)) lastMsgMap.set(key, { content: m.content, created_at: m.created_at });
    });

    const convos: Conversation[] = [];

    for (const task of tasks) {
      // Client conversation
      const clientKey = `${task.id}__${task.user_id}`;
      const clientLastMsg = lastMsgMap.get(clientKey);
      convos.push({
        key: clientKey,
        task_id: task.id,
        task_title: task.title,
        participant_id: task.user_id,
        participant_name: profileMap.get(task.user_id) ?? null,
        participant_role: 'client',
        last_message: clientLastMsg?.content ?? null,
        last_message_at: clientLastMsg?.created_at ?? null,
      });

      // Tasker conversations (assigned + proposers)
      const taskers = taskTaskersMap.get(task.id) ?? new Set();
      for (const taskerId of taskers) {
        const taskerKey = `${task.id}__${taskerId}`;
        const taskerLastMsg = lastMsgMap.get(taskerKey);
        convos.push({
          key: taskerKey,
          task_id: task.id,
          task_title: task.title,
          participant_id: taskerId,
          participant_name: profileMap.get(taskerId) ?? null,
          participant_role: 'tasker',
          last_message: taskerLastMsg?.content ?? null,
          last_message_at: taskerLastMsg?.created_at ?? null,
        });
      }
    }

    convos.sort((a, b) => {
      const aHas = a.last_message ? 1 : 0;
      const bHas = b.last_message ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '');
    });

    setConversations(convos);

    if (preselectedTask && !selectedKey) {
      const match = convos.find(c => c.task_id === preselectedTask);
      if (match) setSelectedKey(match.key);
    }
    if (filterUserId && !selectedKey) {
      const match = convos.find(c => c.participant_id === filterUserId);
      if (match) setSelectedKey(match.key);
    }

    setLoading(false);
  }, [preselectedTask, filterUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (taskId: string, participantId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    const filtered = (data as Message[] ?? []).filter(m =>
      m.recipient_id === participantId || m.sender_id === participantId
    );
    setMessages(filtered);
  }, []);

  useEffect(() => {
    if (!selectedConvo) return;
    loadMessages(selectedConvo.task_id, selectedConvo.participant_id);

    const channel = supabase
      .channel(`admin-chat-${selectedConvo.key}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `task_id=eq.${selectedConvo.task_id}`,
      }, (payload) => {
        const msg = payload.new as Message;
        if (msg.recipient_id === selectedConvo.participant_id || msg.sender_id === selectedConvo.participant_id) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConvo?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !selectedConvo || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    const { error, data: inserted } = await supabase.from('chat_messages').insert({
      task_id: selectedConvo.task_id,
      sender_id: user.id,
      recipient_id: selectedConvo.participant_id,
      content,
    }).select('id').single();

    if (error) {
      toast.error(t('chat.sendError'));
      setNewMessage(content);
    } else {
      const { data: profileData } = await supabase
        .from('profiles').select('email').eq('user_id', selectedConvo.participant_id).single();
      if (profileData?.email) {
        const taskUrl = `${window.location.origin}/tasks/${selectedConvo.task_id}`;
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'admin-message',
            recipientEmail: profileData.email,
            idempotencyKey: `admin-msg-${inserted?.id}-${selectedConvo.participant_id}`,
            templateData: {
              taskTitle: selectedConvo.task_title,
              messagePreview: content.length > 200 ? content.slice(0, 200) + '...' : content,
              taskUrl,
            },
          },
        });
      }
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const filtered = conversations.filter(c => {
    if (filterUserId && c.participant_id !== filterUserId) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      c.task_title.toLowerCase().includes(s) ||
      c.participant_name?.toLowerCase().includes(s)
    );
  });

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div dir={dir}>
      <h1 className="text-2xl font-bold text-foreground mb-4">{t('admin.chat')}</h1>
      <div className="flex border border-border rounded-lg bg-card overflow-hidden" style={{ height: 'calc(100vh - 14rem)' }}>
        <div className={cn("w-80 border-e border-border flex flex-col shrink-0", selectedKey && "hidden md:flex")}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder={t('admin.search')} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">{t('admin.chat.noConversations')}</p>
            )}
            {filtered.map(c => (
              <button
                key={c.key}
                onClick={() => setSelectedKey(c.key)}
                className={cn(
                  "w-full text-start px-4 py-3 border-b border-border hover:bg-secondary/50 transition-colors",
                  selectedKey === c.key && "bg-primary/5"
                )}
              >
                <p className="font-medium text-sm text-foreground truncate">{c.task_title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {c.participant_role === 'client'
                    ? <User className="w-3 h-3 text-blue-500 shrink-0" />
                    : <Wrench className="w-3 h-3 text-orange-500 shrink-0" />
                  }
                  <span className="text-xs text-muted-foreground truncate">
                    {c.participant_name ?? (c.participant_role === 'client' ? t('admin.client') : t('admin.performer'))}
                  </span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                    c.participant_role === 'client'
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                  )}>
                    {c.participant_role === 'client' ? t('admin.client') : t('admin.performer')}
                  </span>
                </div>
                {c.last_message && (
                  <p className="text-xs text-muted-foreground truncate mt-1">{c.last_message}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className={cn("flex-1 flex flex-col", !selectedKey && "hidden md:flex")}>
          {!selectedKey ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t('admin.chat.selectConversation')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <button className="md:hidden text-muted-foreground" onClick={() => setSelectedKey(null)}>←</button>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{selectedConvo?.task_title}</p>
                  <div className="flex items-center gap-1.5">
                    {selectedConvo?.participant_role === 'client'
                      ? <User className="w-3 h-3 text-blue-500" />
                      : <Wrench className="w-3 h-3 text-orange-500" />
                    }
                    <p className="text-xs text-muted-foreground">
                      {selectedConvo?.participant_name ?? (selectedConvo?.participant_role === 'client' ? t('admin.client') : t('admin.performer'))}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-12">{t('chat.empty')}</p>
                )}
                {messages.map(msg => {
                  const isMine = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={cn(
                        "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm",
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary text-foreground rounded-bl-md"
                      )}>
                        {!isMine && (
                          <p className="text-[10px] font-medium mb-1 opacity-70">
                            {selectedConvo?.participant_name ?? (selectedConvo?.participant_role === 'client' ? t('admin.client') : t('admin.performer'))}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className={cn("text-[10px] mt-1", isMine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border px-4 py-3 flex items-end gap-2">
                <textarea
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('chat.placeholder')}
                  rows={1}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <Button size="icon" onClick={handleSend} disabled={!newMessage.trim() || sending}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
