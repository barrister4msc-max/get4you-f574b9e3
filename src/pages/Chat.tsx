import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Send, ArrowLeft, User } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  task_id: string;
  sender_id: string;
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
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch task and messages
  useEffect(() => {
    if (!taskId || !user) return;

    const fetchData = async () => {
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, title, user_id, assigned_to, status')
        .eq('id', taskId)
        .maybeSingle();

      if (taskData) {
        setTask(taskData as TaskInfo);
        const otherId = taskData.user_id === user.id ? taskData.assigned_to : taskData.user_id;
        if (otherId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('user_id', otherId)
            .maybeSingle();
          setOtherProfile(profile);
        }
      }

      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      setMessages((msgs as Message[]) || []);
      setLoading(false);
    };

    fetchData();
  }, [taskId, user]);

  // Realtime subscription
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
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [taskId]);

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

  const isParticipant = task && user && (task.user_id === user.id || task.assigned_to === user.id);
  const canChat = isParticipant && (task?.status === 'in_progress' || task?.status === 'completed');

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <p className="text-muted-foreground">{t('dashboard.loading')}</p>
      </div>
    );
  }

  if (!task || !canChat) {
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
      <div className="border-b border-border bg-card sticky top-16 z-40">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to={`/tasks/${taskId}`} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {otherProfile?.avatar_url ? (
            <img src={otherProfile.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-border" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{otherProfile?.display_name || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{task.title}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="container max-w-2xl mx-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">{t('chat.empty')}</p>
          )}
          {messages.map((msg) => {
            const isMine = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                  isMine
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-card border border-border text-foreground rounded-bl-md'
                }`}>
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      {task.status === 'in_progress' && (
        <div className="border-t border-border bg-card sticky bottom-0">
          <div className="container max-w-2xl mx-auto px-4 py-3 flex items-end gap-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder')}
              rows={1}
              className="flex-1 px-4 py-2.5 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
