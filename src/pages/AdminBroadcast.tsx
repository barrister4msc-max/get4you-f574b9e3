import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send, Loader2, Users, MessageSquare } from 'lucide-react';

const AdminBroadcast = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [taskers, setTaskers] = useState<{ user_id: string; display_name: string | null; phone: string | null }[]>([]);
  const [selectedTaskers, setSelectedTaskers] = useState<string[]>([]);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      setIsAdmin(!!data);

      // Fetch taskers with phones
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'tasker');

      if (roles && roles.length > 0) {
        const userIds = roles.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, phone')
          .in('user_id', userIds);
        setTaskers(profiles?.filter(p => p.phone) || []);
      }
      setLoading(false);
    };
    checkAdmin();
  }, [user]);

  const toggleTasker = (userId: string) => {
    setSelectedTaskers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const selectAll = () => {
    if (selectedTaskers.length === taskers.length) {
      setSelectedTaskers([]);
    } else {
      setSelectedTaskers(taskers.map(t => t.user_id));
    }
  };

  const handleSend = async () => {
    if (!message.trim() || selectedTaskers.length === 0) return;
    setSending(true);
    try {
      const phones = taskers
        .filter(t => selectedTaskers.includes(t.user_id))
        .map(t => t.phone!);

      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          type: 'admin_broadcast',
          phones,
          message: message.trim(),
        },
      });

      if (error) throw error;
      toast.success(`Sent to ${phones.length} taskers`);
      setMessage('');
      setSelectedTaskers([]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to send broadcast');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="container py-20 text-center text-muted-foreground">{t('dashboard.loading')}</div>;
  if (!isAdmin) return <div className="container py-20 text-center text-muted-foreground">{t('admin.esek.accessDenied')}</div>;

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">WhatsApp Broadcast</h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Type your message to taskers..."
            className="w-full min-h-[100px] rounded-lg border border-input bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Recipients ({selectedTaskers.length}/{taskers.length})
            </label>
            <button onClick={selectAll} className="text-sm text-primary hover:underline">
              {selectedTaskers.length === taskers.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {taskers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No taskers with phone numbers found.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {taskers.map(tasker => (
                <label
                  key={tasker.user_id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTaskers.includes(tasker.user_id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTaskers.includes(tasker.user_id)}
                    onChange={() => toggleTasker(tasker.user_id)}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{tasker.display_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{tasker.phone}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !message.trim() || selectedTaskers.length === 0}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {sending ? 'Sending...' : `Send to ${selectedTaskers.length} taskers`}
        </button>
      </div>
    </div>
  );
};

export default AdminBroadcast;
