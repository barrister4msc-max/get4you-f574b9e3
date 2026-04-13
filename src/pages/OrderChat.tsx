import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Send, ArrowLeft, User } from 'lucide-react';
import { toast } from 'sonner';

interface OrderMessage {
  id: string;
  order_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

const OrderChat = () => {
  const { orderId } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [order, setOrder] = useState<any>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [otherProfile, setOtherProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!orderId || !user) return;

    const fetchData = async () => {
      // Fetch order
      const { data: orderData } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (!orderData) { setLoading(false); return; }
      setOrder(orderData);

      // Fetch task info
      if (orderData.task_id) {
        const { data: taskData } = await supabase
          .from('tasks')
          .select('title, user_id, assigned_to')
          .eq('id', orderData.task_id)
          .maybeSingle();
        if (taskData) {
          setTaskTitle(taskData.title);
          const otherId = taskData.user_id === user.id ? taskData.assigned_to : taskData.user_id;
          if (otherId) {
            const { data: profile } = await supabase.rpc('get_public_profile', { target_user_id: otherId });
            setOtherProfile(profile?.[0] || null);
          }
        }
      }

      // Fetch messages
      const { data: msgs } = await supabase
        .from('order_messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      const allMsgs = (msgs as OrderMessage[]) || [];
      setMessages(allMsgs);

      // Sender names
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
  }, [orderId, user]);

  // Realtime
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-chat-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` },
        (payload) => {
          const newMsg = payload.new as OrderMessage;
          setMessages(prev => {
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
  }, [orderId, senderNames]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !orderId || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase.from('order_messages').insert({
      order_id: orderId,
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

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <p className="text-muted-foreground">{t('dashboard.loading')}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-[80vh] py-12">
        <div className="container max-w-2xl mx-auto px-4 text-center">
          <p className="text-muted-foreground mb-4">{t('chat.unavailable')}</p>
          <Link to="/dashboard" className="text-primary font-medium hover:underline">
            ← {t('dashboard.title')}
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
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
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
            <p className="font-semibold text-sm truncate">{taskTitle || t('orderChat.title')}</p>
            <p className="text-xs text-muted-foreground truncate">{otherProfile?.display_name || t('orderChat.title')}</p>
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
            const senderName = senderNames[msg.sender_id] || 'User';
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                  isMine
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-card border border-border text-foreground rounded-bl-md'
                }`}>
                  {!isMine && (
                    <p className="text-[10px] font-medium mb-1 opacity-70">{senderName}</p>
                  )}
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
    </div>
  );
};

export default OrderChat;
