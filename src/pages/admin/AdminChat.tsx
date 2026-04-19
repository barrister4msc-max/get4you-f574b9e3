import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Search, MessageSquare, User, Wrench, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ConvoKind = 'task' | 'direct';

interface Conversation {
  key: string;
  kind: ConvoKind;
  task_id: string | null;
  task_title: string;
  participant_id: string;
  participant_name: string | null;
  participant_role: 'client' | 'tasker' | 'user';
  last_message: string | null;
  last_message_at: string | null;
}

interface Message {
  id: string;
  task_id?: string | null;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  created_at: string;
}

export default function AdminChat() {
  const { user } = useAuth();
  const { t, dir } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
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
    setLoading(true);

    // ----- Task-based conversations -----
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, user_id, assigned_to, status')
      .order('created_at', { ascending: false })
      .limit(200);

    const { data: proposals } = tasks?.length
      ? await supabase
          .from('proposals')
          .select('task_id, user_id')
          .in('task_id', tasks.map(t => t.id))
      : { data: [] as any[] };

    const taskTaskersMap = new Map<string, Set<string>>();
    for (const task of tasks ?? []) {
      const taskers = new Set<string>();
      if (task.assigned_to) taskers.add(task.assigned_to);
      taskTaskersMap.set(task.id, taskers);
    }
    for (const p of (proposals ?? [])) {
      const set = taskTaskersMap.get(p.task_id);
      const ownerId = tasks?.find(t => t.id === p.task_id)?.user_id;
      if (set && p.user_id !== ownerId) set.add(p.user_id);
    }

    const allUserIds = new Set<string>();
    (tasks ?? []).forEach(t => { allUserIds.add(t.user_id); });
    taskTaskersMap.forEach(set => set.forEach(id => allUserIds.add(id)));

    // ----- Direct messages (admin <-> user) -----
    const { data: directRows } = await supabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, content, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    const directLastByUser = new Map<string, { content: string; created_at: string }>();
    for (const m of directRows ?? []) {
      const otherId = m.sender_id === user?.id ? m.recipient_id : m.sender_id;
      if (!otherId) continue;
      allUserIds.add(otherId);
      if (!directLastByUser.has(otherId)) {
        directLastByUser.set(otherId, { content: m.content, created_at: m.created_at });
      }
    }

    // Always include filterUserId so admin can start a fresh thread
    if (filterUserId) allUserIds.add(filterUserId);

    const { data: profiles } = allUserIds.size
      ? await supabase.rpc('get_public_profiles', { target_user_ids: [...allUserIds] })
      : { data: [] as any[] };
    const profileMap = new Map<string, string | null>(
      (profiles ?? []).map((p: any) => [p.user_id as string, (p.display_name ?? null) as string | null])
    );

    // Last messages per task conversation
    const { data: allMessages } = tasks?.length
      ? await supabase
          .from('chat_messages')
          .select('task_id, content, created_at, sender_id, recipient_id')
          .in('task_id', tasks.map(t => t.id))
          .order('created_at', { ascending: false })
      : { data: [] as any[] };

    const lastMsgMap = new Map<string, { content: string; created_at: string }>();
    allMessages?.forEach((m: any) => {
      const participantId = m.recipient_id ?? m.sender_id;
      const key = `${m.task_id}__${participantId}`;
      if (!lastMsgMap.has(key)) lastMsgMap.set(key, { content: m.content, created_at: m.created_at });
    });

    const convos: Conversation[] = [];

    // Direct conversations (one per user we've spoken to, or the requested user)
    const directUserIds = new Set<string>(directLastByUser.keys());
    if (filterUserId) directUserIds.add(filterUserId);
    for (const uid of directUserIds) {
      const last = directLastByUser.get(uid);
      convos.push({
        key: `direct__${uid}`,
        kind: 'direct',
        task_id: null,
        task_title: t('admin.directMessage') || 'Личное сообщение',
        participant_id: uid,
        participant_name: profileMap.get(uid) ?? null,
        participant_role: 'user',
        last_message: last?.content ?? null,
        last_message_at: last?.created_at ?? null,
      });
    }

    for (const task of tasks ?? []) {
      const clientKey = `task__${task.id}__${task.user_id}`;
      const clientLastMsg = lastMsgMap.get(`${task.id}__${task.user_id}`);
      convos.push({
        key: clientKey,
        kind: 'task',
        task_id: task.id,
        task_title: task.title,
        participant_id: task.user_id,
        participant_name: profileMap.get(task.user_id) ?? null,
        participant_role: 'client',
        last_message: clientLastMsg?.content ?? null,
        last_message_at: clientLastMsg?.created_at ?? null,
      });

      const taskers = taskTaskersMap.get(task.id) ?? new Set();
      for (const taskerId of taskers) {
        const taskerKey = `task__${task.id}__${taskerId}`;
        const taskerLastMsg = lastMsgMap.get(`${task.id}__${taskerId}`);
        convos.push({
          key: taskerKey,
          kind: 'task',
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

    // Auto-select: prefer direct convo with the requested user
    setSelectedKey(prev => {
      if (prev) return prev;
      if (filterUserId) {
        const direct = convos.find(c => c.kind === 'direct' && c.participant_id === filterUserId);
        if (direct) return direct.key;
      }
      if (preselectedTask) {
        const m = convos.find(c => c.task_id === preselectedTask);
        if (m) return m.key;
      }
      return null;
    });

    setLoading(false);
  }, [preselectedTask, filterUserId, user?.id, t]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (convo: Conversation) => {
    if (convo.kind === 'task' && convo.task_id) {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('task_id', convo.task_id)
        .order('created_at', { ascending: true });
      const filtered = (data as Message[] ?? []).filter(m =>
        m.recipient_id === convo.participant_id || m.sender_id === convo.participant_id
      );
      setMessages(filtered);
    } else {
      // direct
      const { data } = await supabase
        .from('direct_messages')
        .select('id, sender_id, recipient_id, content, created_at')
        .or(`and(sender_id.eq.${user?.id},recipient_id.eq.${convo.participant_id}),and(sender_id.eq.${convo.participant_id},recipient_id.eq.${user?.id})`)
        .order('created_at', { ascending: true });
      setMessages((data as Message[]) ?? []);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!selectedConvo) return;
    loadMessages(selectedConvo);

    const channel = supabase.channel(`admin-chat-${selectedConvo.key}`);

    if (selectedConvo.kind === 'task' && selectedConvo.task_id) {
      channel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `task_id=eq.${selectedConvo.task_id}`,
      }, (payload) => {
        const msg = payload.new as Message;
        if (msg.recipient_id === selectedConvo.participant_id || msg.sender_id === selectedConvo.participant_id) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        }
      });
    } else {
      channel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
      }, (payload) => {
        const msg = payload.new as Message;
        const involves = (msg.sender_id === user?.id && msg.recipient_id === selectedConvo.participant_id) ||
                         (msg.sender_id === selectedConvo.participant_id && msg.recipient_id === user?.id);
        if (involves) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        }
      });
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConvo?.key, loadMessages, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !selectedConvo || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    let errorMsg: any = null;
    let insertedId: string | undefined;

    if (selectedConvo.kind === 'task' && selectedConvo.task_id) {
      const { error, data } = await supabase.from('chat_messages').insert({
        task_id: selectedConvo.task_id,
        sender_id: user.id,
        recipient_id: selectedConvo.participant_id,
        content,
      }).select('id').single();
      errorMsg = error;
      insertedId = data?.id;
    } else {
      const { error, data } = await supabase.from('direct_messages').insert({
        sender_id: user.id,
        recipient_id: selectedConvo.participant_id,
        content,
      }).select('id').single();
      errorMsg = error;
      insertedId = data?.id;
    }

    if (errorMsg) {
      console.error('Send error:', errorMsg);
      toast.error(t('chat.sendError') || 'Ошибка отправки');
      setNewMessage(content);
    } else {
      // Email notification
      const { data: profileData } = await supabase
        .from('profiles').select('email').eq('user_id', selectedConvo.participant_id).maybeSingle();
      if (profileData?.email) {
        const taskUrl = selectedConvo.task_id
          ? `${window.location.origin}/tasks/${selectedConvo.task_id}`
          : `${window.location.origin}/dashboard`;
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'admin-message',
            recipientEmail: profileData.email,
            idempotencyKey: `admin-msg-${insertedId}-${selectedConvo.participant_id}`,
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">{t('admin.chat')}</h1>
        {filterUserId && (
          <Button variant="outline" size="sm" onClick={() => { setSelectedKey(null); setSearchParams({}); }}>
            {t('common.clearFilter') || 'Сбросить фильтр'}
          </Button>
        )}
      </div>
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
                <p className="font-medium text-sm text-foreground truncate flex items-center gap-1.5">
                  {c.kind === 'direct' && <Mail className="w-3 h-3 text-primary shrink-0" />}
                  {c.task_title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {c.participant_role === 'client'
                    ? <User className="w-3 h-3 text-blue-500 shrink-0" />
                    : c.participant_role === 'tasker'
                      ? <Wrench className="w-3 h-3 text-orange-500 shrink-0" />
                      : <User className="w-3 h-3 text-muted-foreground shrink-0" />
                  }
                  <span className="text-xs text-muted-foreground truncate">
                    {c.participant_name ?? (c.participant_role === 'client' ? t('admin.client') : c.participant_role === 'tasker' ? t('admin.performer') : 'User')}
                  </span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                    c.kind === 'direct'
                      ? "bg-primary/10 text-primary"
                      : c.participant_role === 'client'
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                  )}>
                    {c.kind === 'direct' ? 'DM' : c.participant_role === 'client' ? t('admin.client') : t('admin.performer')}
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
                  <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                    {selectedConvo?.kind === 'direct' && <Mail className="w-3.5 h-3.5 text-primary" />}
                    {selectedConvo?.task_title}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {selectedConvo?.participant_role === 'client'
                      ? <User className="w-3 h-3 text-blue-500" />
                      : selectedConvo?.participant_role === 'tasker'
                        ? <Wrench className="w-3 h-3 text-orange-500" />
                        : <User className="w-3 h-3 text-muted-foreground" />
                    }
                    <p className="text-xs text-muted-foreground">
                      {selectedConvo?.participant_name ?? 'User'}
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
                            {selectedConvo?.participant_name ?? 'User'}
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
