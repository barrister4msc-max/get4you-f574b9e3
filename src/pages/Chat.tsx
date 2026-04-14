import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Send, ArrowLeft, User, Shield, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  task_id: string;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  created_at: string;
}

interface TaskInfo {
  id: string;
  title: string;
  user_id: string;
  assigned_to: string | null;
  status: string | null;
}

const ChatPage = () => {
  const { taskId } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [task, setTask] = useState<TaskInfo | null>(null);
  const [otherProfile, setOtherProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isParticipant, setIsParticipant] = useState(false);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!taskId || !user) return;

    const fetchData = async () => {
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, title, user_id, assigned_to, status')
        .eq('id', taskId)
        .maybeSingle();

      if (!taskData) { setLoading(false); return; }
      setTask(taskData as TaskInfo);

      const isOwnerOrAssigned = taskData.user_id === user.id || taskData.assigned_to === user.id;
      const activeStatuses = ['in_progress', 'completed', 'dispute'];
      const participant = isOwnerOrAssigned && activeStatuses.includes(taskData.status || '');
      setIsParticipant(participant);

      const otherId = taskData.user_id === user.id ? taskData.assigned_to : taskData.user_id;
      if (otherId) {
        const { data: profile } = await supabase.rpc('get_public_profile', { target_user_id: otherId });
        setOtherProfile(profile?.[0] || null);
      }

      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      const allMsgs = (msgs as Message[]) || [];
      setMessages(allMsgs);

      const senderIds = [...new Set(allMsgs.map(m => m.sender_id))];
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase.rpc('get_public_profiles', { target_user_ids: senderIds });
        const names: Record<string, string> = {};
        profiles?.forEach(p => { names[p.user_id] = p.display_name || 'User'; });
        setSenderNames(names);
      }

      setLoading(false);
    };

    fetchData();
  }, [taskId, user]);

  useEffect(() => {
    if (!taskId) return;

    const channel = supabase
      .channel(`chat-${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `task_id=eq.${taskId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (!senderNames[newMsg.sender_id]) {
            supabase.rpc('get_public_profile', { target_user_id: newMsg.sender_id }).then(({ data }) => {
              if (data?.[0]) {
                setSenderNames(prev => ({ ...prev, [newMsg.sender_id]: data[0].display_name || 'User' }));
              }
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [taskId, senderNames]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !taskId || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase.from('chat_messages').insert({
      task_id: taskId,
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

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const canChat = isParticipant && !!task && (task.status === 'in_progress' || task.status === 'completed' || task.status === 'dispute');

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <p className="text-muted-foreground">{t('dashboard.loading')}</p>
      </div>
    );
  }

  if (!task || !isParticipant) {
    return (
      <div className="min-h-[80vh] py-12">
        <div className="container max-w-2xl mx-auto px-4 text-center">
          <p className="text-muted-foreground mb-4">{t('chat.unavailable')}</p>
          <Link to={taskId ? `/tasks/${taskId}` : '/dashboard'} className="text-primary font-medium hover:underline">
            ← {t('chat.backToTask')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="sticky top-16 z-40 border-b border-border bg-[#075e54] text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link to={`/tasks/${taskId}`} className="text-white/80 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {otherProfile?.avatar_url ? (
            <img src={otherProfile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white/20" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#25d366]/30 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{otherProfile?.display_name || 'Chat'}</p>
            <p className="text-xs text-white/60 truncate">{task.title}</p>
          </div>
          {task?.status && (
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/80">
              {t(`tasks.status.${task.status}`)}
            </span>
          )}
        </div>
      </div>

      {/* Messages area with WhatsApp-style background */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          backgroundColor: '#e5ddd5',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c3bc' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        <div className="mx-auto max-w-2xl px-3 py-4 space-y-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/60">
                <MessageCircle className="h-8 w-8 text-[#075e54]" />
              </div>
              <p className="text-sm font-medium text-[#303030]">{t('chat.empty')}</p>
            </div>
          )}
          {messages.map((msg) => {
            const isMine = msg.sender_id === user?.id;
            const isAdminMsg = msg.recipient_id !== null && !isMine;
            const senderName = senderNames[msg.sender_id] || 'User';
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}>
                {/* Tail for received messages */}
                {!isMine && (
                  <div className="flex-shrink-0 w-2 mt-0">
                    <svg width="8" height="13" viewBox="0 0 8 13" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 0L8 0L8 13C8 13 4 8 0 6V0Z" fill={isAdminMsg ? '#fdf6e3' : '#ffffff'} />
                    </svg>
                  </div>
                )}
                <div
                  className={`relative max-w-[78%] px-3 py-1.5 text-sm shadow-sm ${
                    isMine
                      ? 'bg-[#dcf8c6] text-[#303030]'
                      : isAdminMsg
                      ? 'bg-[#fdf6e3] text-[#303030]'
                      : 'bg-white text-[#303030]'
                  }`}
                  style={{
                    borderRadius: isMine ? '7.5px 0 7.5px 7.5px' : '0 7.5px 7.5px 7.5px',
                  }}
                >
                  {!isMine && (
                    <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: isAdminMsg ? '#cf7d0a' : '#06cf9c' }}>
                      {isAdminMsg && <Shield className="w-2.5 h-2.5" />}
                      {senderName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content}
                    <span className="invisible ml-3 inline-block w-[50px] text-[11px]">00:00</span>
                  </p>
                  <span className="absolute bottom-1 right-2 text-[11px] text-[#667781]">
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                {/* Tail for sent messages */}
                {isMine && (
                  <div className="flex-shrink-0 w-2 mt-0">
                    <svg width="8" height="13" viewBox="0 0 8 13" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 0L0 0L0 13C0 13 4 8 8 6V0Z" fill="#dcf8c6" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      {canChat ? (
        <div className="sticky bottom-0 z-40 border-t border-border bg-[#f0f0f0]">
          <div className="mx-auto flex max-w-2xl items-end gap-2 px-3 py-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder')}
              rows={1}
              className="min-h-[42px] max-h-[100px] flex-1 resize-none rounded-3xl border-0 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#075e54]/30"
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#075e54] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : isParticipant && task && (
        <div className="sticky bottom-0 border-t border-border bg-[#f0f0f0]">
          <div className="mx-auto max-w-2xl px-4 py-3 text-center">
            <p className="text-xs text-[#667781]">{t('chat.restricted')}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
