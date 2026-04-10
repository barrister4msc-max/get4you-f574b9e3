import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Search, User, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Conversation {
  task_id: string;
  task_title: string;
  client_name: string | null;
  tasker_name: string | null;
  client_id: string;
  tasker_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

interface Message {
  id: string;
  task_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export default function AdminChat() {
  const { user } = useAuth();
  const { t, dir } = useLanguage();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(searchParams.get('task'));
  const filterUserId = searchParams.get('user');
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    // Get all tasks (admin can chat on any task)
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, user_id, assigned_to, status')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!tasks?.length) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(tasks.flatMap(t => [t.user_id, t.assigned_to].filter(Boolean) as string[]))];
    const { data: profiles } = await supabase.rpc('get_public_profiles', { target_user_ids: userIds });
    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) ?? []);

    // Get last message per task
    const { data: allMessages } = await supabase
      .from('chat_messages')
      .select('task_id, content, created_at')
      .in('task_id', tasks.map(t => t.id))
      .order('created_at', { ascending: false });

    const lastMsgMap = new Map<string, { content: string; created_at: string }>();
    allMessages?.forEach(m => {
      if (!lastMsgMap.has(m.task_id)) lastMsgMap.set(m.task_id, { content: m.content, created_at: m.created_at });
    });

    const convos: Conversation[] = tasks
      .map(t => ({
        task_id: t.id,
        task_title: t.title,
        client_name: profileMap.get(t.user_id) ?? null,
        tasker_name: t.assigned_to ? profileMap.get(t.assigned_to) ?? null : null,
        client_id: t.user_id,
        tasker_id: t.assigned_to,
        last_message: lastMsgMap.get(t.id)?.content ?? null,
        last_message_at: lastMsgMap.get(t.id)?.created_at ?? t.id, // fallback for sorting
        unread_count: 0,
      }))
      .sort((a, b) => {
        // Tasks with messages first, then by date
        const aHasMsg = a.last_message ? 1 : 0;
        const bHasMsg = b.last_message ? 1 : 0;
        if (aHasMsg !== bHasMsg) return bHasMsg - aHasMsg;
        return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '');
      });

    setConversations(convos);
    setLoading(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (taskId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) ?? []);
  }, []);

  useEffect(() => {
    if (!selectedTaskId) return;
    loadMessages(selectedTaskId);

    const channel = supabase
      .channel(`admin-chat-${selectedTaskId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `task_id=eq.${selectedTaskId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedTaskId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !selectedTaskId || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase.from('chat_messages').insert({
      task_id: selectedTaskId,
      sender_id: user.id,
      content,
    });

    if (error) {
      toast.error(t('chat.sendError'));
      setNewMessage(content);
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectedConvo = conversations.find(c => c.task_id === selectedTaskId);

  const filtered = conversations.filter(c => {
    if (filterUserId) {
      if (c.client_id !== filterUserId && c.tasker_id !== filterUserId) return false;
    }
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      c.task_title.toLowerCase().includes(s) ||
      c.client_name?.toLowerCase().includes(s) ||
      c.tasker_name?.toLowerCase().includes(s)
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
        {/* Conversation list */}
        <div className={cn("w-80 border-e border-border flex flex-col shrink-0", selectedTaskId && "hidden md:flex")}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('admin.search')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="ps-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">{t('admin.chat.noConversations')}</p>
            )}
            {filtered.map(c => (
              <button
                key={c.task_id}
                onClick={() => setSelectedTaskId(c.task_id)}
                className={cn(
                  "w-full text-start px-4 py-3 border-b border-border hover:bg-secondary/50 transition-colors",
                  selectedTaskId === c.task_id && "bg-primary/5"
                )}
              >
                <p className="font-medium text-sm text-foreground truncate">{c.task_title}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {c.client_name ?? t('admin.client')} ↔ {c.tasker_name ?? t('admin.performer')}
                </p>
                {c.last_message && (
                  <p className="text-xs text-muted-foreground truncate mt-1">{c.last_message}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className={cn("flex-1 flex flex-col", !selectedTaskId && "hidden md:flex")}>
          {!selectedTaskId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t('admin.chat.selectConversation')}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <button
                  className="md:hidden text-muted-foreground"
                  onClick={() => setSelectedTaskId(null)}
                >
                  ←
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{selectedConvo?.task_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedConvo?.client_name ?? t('admin.client')} ↔ {selectedConvo?.tasker_name ?? t('admin.performer')}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-12">{t('chat.empty')}</p>
                )}
                {messages.map(msg => {
                  const isMine = msg.sender_id === user?.id;
                  const isClient = msg.sender_id === selectedConvo?.client_id;
                  const senderLabel = isMine
                    ? t('admin.chat.you')
                    : isClient
                      ? (selectedConvo?.client_name ?? t('admin.client'))
                      : (selectedConvo?.tasker_name ?? t('admin.performer'));

                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={cn(
                        "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm",
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary text-foreground rounded-bl-md"
                      )}>
                        {!isMine && (
                          <p className="text-[10px] font-medium mb-1 opacity-70">{senderLabel}</p>
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

              {/* Input */}
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
