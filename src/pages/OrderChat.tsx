import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Send,
  ArrowLeft,
  User,
  MessageCircle,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { openDispute } from '@/lib/api/protectedWrites';
import { friendlyErrorMessage } from '@/lib/api/friendlyError';

interface OrderMessage {
  id: string;
  order_id: string;
  sender_id: string;
  content: string;
  file_url?: string | null;
  file_name?: string | null;
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
  const [uploading, setUploading] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDetails, setDisputeDetails] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!orderId || !user) return;

    const fetchData = async () => {
      const { data: orderData } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (!orderData) { setLoading(false); return; }
      setOrder(orderData);

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

      const { data: msgs } = await supabase
        .from('order_messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      const allMsgs = (msgs as OrderMessage[]) || [];
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
  }, [orderId, user]);

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

  const handleSend = async (fileUrl?: string, fileName?: string) => {
    if ((!newMessage.trim() && !fileUrl) || !user || !orderId || sending) return;
    setSending(true);
    const content = newMessage.trim() || (fileName || 'File');
    setNewMessage('');

    const insertData: Record<string, unknown> = {
      order_id: orderId,
      sender_id: user.id,
      content,
    };
    if (fileUrl) {
      insertData.file_url = fileUrl;
      insertData.file_name = fileName || 'file';
    }

    const { error } = await supabase.from('order_messages').insert(insertData as any);

    if (error) {
      toast.error(t('chat.sendError'));
      setNewMessage(content);
    }
    setSending(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !orderId) return;
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)');
      return;
    }

    setUploading(true);
    try {
      const path = `${orderId}/${user.id}/${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('order-chat-files')
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('order-chat-files')
        .getPublicUrl(path);

      await handleSend(urlData.publicUrl, file.name);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(t('proposal.error'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(url);

  const submitDispute = async () => {
    if (!order?.assignment_id) {
      toast.error(t('dispute.error'));
      return;
    }
    const reason = disputeReason.trim();
    if (reason.length < 3) return;

    setDisputeSubmitting(true);
    try {
      const { error } = await openDispute(
        order.assignment_id,
        reason,
        disputeDetails.trim() || undefined,
      );
      if (error) {
        toast.error(friendlyErrorMessage(error, t('dispute.error')));
        return;
      }
      toast.success(t('dispute.submitted'));
      setDisputeOpen(false);
      setDisputeReason('');
      setDisputeDetails('');
    } finally {
      setDisputeSubmitting(false);
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
    <div className="min-h-[80vh] flex flex-col" style={{ background: '#e5ddd5' }}>
      {/* Header */}
      <div className="sticky top-16 z-40 px-0">
        <div
          className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3"
          style={{ background: '#075e54' }}
        >
          <Link to="/dashboard" className="text-white/80 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {otherProfile?.avatar_url ? (
            <img src={otherProfile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white/20" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#128c7e' }}>
              <User className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-white truncate">
              {otherProfile?.display_name || t('orderChat.title')}
            </p>
            <p className="text-xs text-white/70 truncate">{taskTitle || t('orderChat.title')}</p>
          </div>
          {order?.assignment_id && (
            <button
              onClick={() => setDisputeOpen(true)}
              className="text-white/80 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
              title={t('dispute.openDispute')}
              aria-label={t('dispute.openDispute')}
            >
              <AlertTriangle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 py-4 space-y-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: '#128c7e20' }}
              >
                <MessageCircle className="w-8 h-8" style={{ color: '#128c7e' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: '#667781' }}>
                {t('orderChat.startChat') || 'Начните диалог'}
              </p>
            </div>
          )}
          {messages.map((msg) => {
            const isMine = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}>
                <div
                  className="relative px-3 py-1.5 text-sm shadow-sm"
                  style={{
                    maxWidth: '70%',
                    background: isMine ? '#dcf8c6' : '#ffffff',
                    borderRadius: isMine
                      ? '7.5px 7.5px 0 7.5px'
                      : '7.5px 7.5px 7.5px 0',
                    color: '#303030',
                  }}
                >
                  {!isMine && (
                    <p className="text-xs font-semibold mb-0.5" style={{ color: '#128c7e' }}>
                      {senderNames[msg.sender_id] || 'User'}
                    </p>
                  )}
                  
                  {/* File/image attachment */}
                  {msg.file_url && (
                    isImageUrl(msg.file_url) ? (
                      <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="block mb-1">
                        <img src={msg.file_url} alt={msg.file_name || ''} className="max-w-full rounded-lg max-h-60 object-cover" />
                      </a>
                    ) : (
                      <a
                        href={msg.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 mb-1 p-2 rounded-lg"
                        style={{ background: isMine ? '#c8e6b5' : '#f0f0f0' }}
                      >
                        <FileText className="w-5 h-5 shrink-0" style={{ color: '#128c7e' }} />
                        <span className="text-xs font-medium truncate">{msg.file_name || 'File'}</span>
                      </a>
                    )
                  )}

                  {/* Don't show content text if it's just the file name */}
                  {(!msg.file_url || msg.content !== (msg.file_name || 'File')) && (
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {msg.content}
                      <span className="invisible text-[11px] ml-3 inline-block w-[58px]">00:00</span>
                    </p>
                  )}
                  <span
                    className="absolute bottom-1 right-2 text-[11px]"
                    style={{ color: '#667781' }}
                  >
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 z-40" style={{ background: '#f0f0f0' }}>
        <div className="max-w-2xl mx-auto px-3 py-2 flex items-end gap-2">
          {/* File upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-[42px] h-[42px] rounded-full flex items-center justify-center transition-opacity disabled:opacity-40 flex-shrink-0"
            style={{ background: '#ffffff' }}
            title={t('orderChat.sendFile')}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#128c7e' }} />
            ) : (
              <Paperclip className="w-5 h-5" style={{ color: '#54656f' }} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
            className="hidden"
            onChange={handleFileUpload}
          />
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            rows={1}
            className="flex-1 px-4 py-2.5 rounded-3xl border-0 text-sm resize-none focus:outline-none focus:ring-0"
            style={{
              background: '#ffffff',
              color: '#303030',
              minHeight: '42px',
              maxHeight: '100px',
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!newMessage.trim() || sending}
            className="w-[42px] h-[42px] rounded-full flex items-center justify-center transition-opacity disabled:opacity-40 flex-shrink-0"
            style={{ background: '#00a884' }}
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderChat;
