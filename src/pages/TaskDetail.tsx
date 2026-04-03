import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Clock, User, Shield, ArrowRight, Play, ImageIcon,
  Send, DollarSign, CheckCircle2, XCircle, Loader2, MessageCircle,
  Lock, Unlock, AlertTriangle, MessageSquare, CreditCard, Star,
} from 'lucide-react';

interface Proposal {
  id: string;
  user_id: string;
  price: number;
  comment: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  currency: string | null;
  created_at: string;
  profile?: { display_name: string | null; avatar_url: string | null; bio: string | null; city: string | null; phone: string | null } | null;
  avgRating?: number | null;
  reviewCount?: number;
}

const TaskDetailPage = () => {
  const { id } = useParams();
  const { t, currency, locale } = useLanguage();
  const formatPrice = useFormatPrice();
  const { user } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [ownerProfile, setOwnerProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [assignedProfile, setAssignedProfile] = useState<{ display_name: string | null; avatar_url: string | null; bio: string | null; city: string | null; phone: string | null } | null>(null);
  const [assignedRating, setAssignedRating] = useState<{ avg: number | null; count: number }>({ avg: null, count: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Proposals state
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [price, setPrice] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  // Escrow state
  const [escrow, setEscrow] = useState<any>(null);
  const [completing, setCompleting] = useState(false);

  // Payment dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [pendingAcceptProposalId, setPendingAcceptProposalId] = useState<string | null>(null);

  const isOwner = user?.id === task?.user_id;
  const hasProposed = proposals.some(p => p.user_id === user?.id);

  useEffect(() => {
    const fetchTask = async () => {
      if (!id) return;
      const { data } = await supabase
        .from('tasks')
        .select('*, categories(name_en, name_ru, name_he)')
        .eq('id', id)
        .maybeSingle();

      if (data?.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('user_id', data.user_id)
          .maybeSingle();
        setOwnerProfile(profile);
      }

      setTask(data);
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  // Fetch proposals with profiles and ratings
  useEffect(() => {
    const fetchProposals = async () => {
      if (!id) return;
      const { data } = await supabase
        .from('proposals')
        .select('*')
        .eq('task_id', id)
        .order('created_at', { ascending: false });

      if (data) {
        const userIds = [...new Set(data.map(p => p.user_id))];
        const [profilesRes, reviewsRes] = await Promise.all([
          supabase.from('profiles').select('user_id, display_name, avatar_url, bio, city, phone').in('user_id', userIds),
          supabase.from('reviews').select('reviewee_id, rating').in('reviewee_id', userIds),
        ]);

        const profileMap = new Map(profilesRes.data?.map(p => [p.user_id, p]) || []);
        
        // Calculate avg rating per user
        const ratingMap = new Map<string, { sum: number; count: number }>();
        reviewsRes.data?.forEach(r => {
          const existing = ratingMap.get(r.reviewee_id) || { sum: 0, count: 0 };
          ratingMap.set(r.reviewee_id, { sum: existing.sum + r.rating, count: existing.count + 1 });
        });

        const enriched = data.map(p => ({
          ...p,
          status: p.status as 'pending' | 'accepted' | 'rejected',
          profile: profileMap.get(p.user_id) || null,
          avgRating: ratingMap.has(p.user_id) ? ratingMap.get(p.user_id)!.sum / ratingMap.get(p.user_id)!.count : null,
          reviewCount: ratingMap.get(p.user_id)?.count || 0,
        }));
        setProposals(enriched);
      }
    };
    fetchProposals();
  }, [id]);

  // Fetch escrow
  useEffect(() => {
    if (!id) return;
    const fetchEscrow = async () => {
      const { data } = await supabase
        .from('escrow_transactions')
        .select('*')
        .eq('task_id', id)
        .maybeSingle();
      if (data) setEscrow(data);
    };
    fetchEscrow();
  }, [id]);

  const handleCompleteTask = async () => {
    if (!id || !escrow) return;
    setCompleting(true);
    try {
      await supabase
        .from('escrow_transactions')
        .update({ status: 'released', released_at: new Date().toISOString() })
        .eq('id', escrow.id);
      await supabase
        .from('tasks')
        .update({ status: 'completed' })
        .eq('id', id);
      setEscrow((prev: any) => ({ ...prev, status: 'released' }));
      setTask((prev: any) => ({ ...prev, status: 'completed' }));
      toast.success(t('escrow.released'));
    } catch {
      toast.error(t('escrow.error'));
    } finally {
      setCompleting(false);
    }
  };

  const handleSubmitProposal = async () => {
    if (!user || !id || !price) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.from('proposals').insert({
        task_id: id,
        user_id: user.id,
        price: Number(price),
        comment: comment.trim() || null,
        currency,
      }).select().single();

      if (error) throw error;

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, bio, city, phone')
        .eq('user_id', user.id)
        .maybeSingle();

      setProposals(prev => [{
        ...data,
        status: data.status as 'pending' | 'accepted' | 'rejected',
        profile,
        avgRating: null,
        reviewCount: 0,
      }, ...prev]);
      setShowForm(false);
      setPrice('');
      setComment('');
        toast.success(t('proposal.sent'));

        // Send WhatsApp to task owner about new proposal
        if (task?.user_id) {
          const { data: ownerProf } = await supabase
            .from('profiles')
            .select('phone')
            .eq('user_id', task.user_id)
            .maybeSingle();
          if (ownerProf?.phone) {
            const { data: session } = await supabase.auth.getSession();
            supabase.functions.invoke('send-whatsapp', {
              body: {
                type: 'new_proposal',
                phone: ownerProf.phone,
                task_id: id,
              },
            }).catch(console.error);
          }
        }
    } catch {
      toast.error(t('proposal.error'));
    } finally {
      setSubmitting(false);
    }
  };

  // When accepting, show payment dialog first
  const handleAcceptClick = (proposalId: string) => {
    setPendingAcceptProposalId(proposalId);
    setShowPaymentDialog(true);
  };

  const handlePaymentConfirm = async () => {
    setPaymentProcessing(true);
    // Simulate payment processing
    await new Promise(r => setTimeout(r, 2000));
    setPaymentProcessing(false);
    setShowPaymentDialog(false);
    toast.success(t('payment.success'));
    
    if (pendingAcceptProposalId) {
      await handleUpdateProposal(pendingAcceptProposalId, 'accepted');
      setPendingAcceptProposalId(null);
    }
  };

  const handleUpdateProposal = async (proposalId: string, status: 'accepted' | 'rejected') => {
    setUpdating(proposalId);
    try {
      const { error } = await supabase
        .from('proposals')
        .update({ status })
        .eq('id', proposalId);

      if (error) throw error;

      if (status === 'accepted') {
        const proposal = proposals.find(p => p.id === proposalId);
        if (proposal) {
          await supabase
            .from('tasks')
            .update({ status: 'in_progress', assigned_to: proposal.user_id })
            .eq('id', id!);
          setTask((prev: any) => ({ ...prev, status: 'in_progress', assigned_to: proposal.user_id }));

          const commissionRate = 0.15;
          const commissionAmount = Math.round(proposal.price * commissionRate * 100) / 100;
          const netAmount = proposal.price - commissionAmount;
          const { data: escrowData } = await supabase.from('escrow_transactions').insert({
            task_id: id!,
            proposal_id: proposalId,
            client_id: user!.id,
            tasker_id: proposal.user_id,
            amount: proposal.price,
            currency: proposal.currency || currency,
            commission_rate: commissionRate,
            commission_amount: commissionAmount,
            net_amount: netAmount,
            status: 'held',
          }).select().single();
          if (escrowData) setEscrow(escrowData);
        }
        const otherPending = proposals.filter(p => p.id !== proposalId && p.status === 'pending');
        for (const p of otherPending) {
          await supabase.from('proposals').update({ status: 'rejected' }).eq('id', p.id);
        }
        toast.success(t('proposal.accepted'));

          // Send WhatsApp to tasker about being hired
          if (proposal?.profile?.phone) {
            supabase.functions.invoke('send-whatsapp', {
              body: {
                type: 'tasker_hired',
                phone: proposal.profile.phone,
                task_id: id,
              },
            }).catch(console.error);
          }
      } else {
        toast.success(t('proposal.rejected'));
      }

      setProposals(prev =>
        prev.map(p => {
          if (p.id === proposalId) return { ...p, status };
          if (status === 'accepted' && p.status === 'pending') return { ...p, status: 'rejected' as const };
          return p;
        })
      );
    } catch {
      toast.error(t('proposal.error'));
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="py-8">
        <div className="container max-w-4xl text-center text-muted-foreground py-20">Loading...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="py-8">
        <div className="container max-w-4xl text-center text-muted-foreground py-20">{t('tasks.noResults')}</div>
      </div>
    );
  }

  const catName = task.categories
    ? locale === 'ru' ? task.categories.name_ru || task.categories.name_en
    : locale === 'he' ? task.categories.name_he || task.categories.name_en
    : task.categories.name_en
    : null;

  const budget = task.budget_fixed || task.budget_min || 0;
  const photos: string[] = task.photos || [];
  const ownerName = ownerProfile?.display_name || 'User';

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700',
    accepted: 'bg-emerald-50 text-primary',
    rejected: 'bg-red-50 text-red-600',
  };

  return (
    <div className="py-8">
      <div className="container max-w-4xl">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Main */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {catName && (
                  <span className="bg-emerald-50 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                    {catName}
                  </span>
                )}
                {task.is_urgent && (
                  <span className="bg-red-50 text-red-600 text-xs font-medium px-2.5 py-1 rounded-full">
                    {t('task.urgency.urgent')}
                  </span>
                )}
                {task.task_type && (
                  <span className="bg-secondary text-muted-foreground text-xs px-2.5 py-1 rounded-full">
                    {t(`task.type.${task.task_type}`)}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold">{task.title}</h1>
              {task.description && (
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{task.description}</p>
              )}

              <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
                {(task.city || task.address) && (
                  <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{task.city || task.address}</span>
                )}
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{new Date(task.created_at).toLocaleDateString()}</span>
              </div>

              {photos.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl overflow-hidden border border-border bg-secondary">
                    <img
                      src={selectedPhoto || photos[0]}
                      alt=""
                      className="w-full h-64 object-cover cursor-pointer"
                      onClick={() => window.open(selectedPhoto || photos[0], '_blank')}
                    />
                  </div>
                  {photos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {photos.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedPhoto(url)}
                          className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${
                            (selectedPhoto || photos[0]) === url ? 'border-primary' : 'border-border'
                          }`}
                        >
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 bg-secondary rounded-xl h-40 flex items-center justify-center text-sm text-muted-foreground">
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                </div>
              )}

              {task.voice_note_url && (
                <div className="mt-4 flex items-center gap-3 bg-muted rounded-xl p-3 border border-border">
                  <Play className="w-4 h-4 text-muted-foreground shrink-0" />
                  <audio src={task.voice_note_url} controls className="flex-1 h-8" />
                </div>
              )}
            </div>

            {/* Proposals section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  {proposals.length} {t('proposal.count')}
                </h2>
              </div>

              {proposals.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8 bg-card border border-border rounded-2xl">
                  {t('proposal.none')}
                </p>
              )}

              <div className="space-y-3">
                {proposals.map((proposal, i) => (
                  <motion.div
                    key={proposal.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card border border-border rounded-xl p-4 hover:shadow-card-hover transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {proposal.profile?.avatar_url ? (
                          <img src={proposal.profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-border" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-sm">{proposal.profile?.display_name || 'User'}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {proposal.profile?.city && (
                              <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{proposal.profile.city}</span>
                            )}
                            {proposal.avgRating && (
                              <span className="flex items-center gap-0.5">
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                {proposal.avgRating.toFixed(1)} ({proposal.reviewCount})
                              </span>
                            )}
                            <span>{new Date(proposal.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="font-bold text-primary">{formatPrice(proposal.price, currency, proposal.currency)}</div>
                        <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[proposal.status]}`}>
                          {t(`proposal.status.${proposal.status}`)}
                        </span>
                      </div>
                    </div>

                    {/* Expanded tasker info for task owner */}
                    {isOwner && proposal.profile?.bio && (
                      <p className="text-xs text-muted-foreground mt-2 bg-muted/50 rounded-lg p-2">{proposal.profile.bio}</p>
                    )}

                    {proposal.comment && (
                      <p className="text-sm text-muted-foreground mt-2">{proposal.comment}</p>
                    )}

                    {/* Accept/Reject buttons for task owner */}
                    {isOwner && proposal.status === 'pending' && task.status === 'open' && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleAcceptClick(proposal.id)}
                          disabled={updating === proposal.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {updating === proposal.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          {t('proposal.accept')}
                        </button>
                        <button
                          onClick={() => handleUpdateProposal(proposal.id, 'rejected')}
                          disabled={updating === proposal.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3 h-3" />
                          {t('proposal.reject')}
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5 sticky top-20">
              <div className="text-2xl font-bold text-primary">{formatPrice(budget, currency, task.currency)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('task.budget')}</p>

              {/* Offer button / form */}
              {!isOwner && task.status === 'open' && (
                <>
                  {!user ? (
                    <p className="text-xs text-muted-foreground mt-4 text-center">{t('proposal.login')}</p>
                  ) : hasProposed ? (
                    <p className="text-xs text-primary mt-4 text-center font-medium">{t('proposal.already')}</p>
                  ) : (
                    <>
                      <AnimatePresence>
                        {showForm ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 space-y-3"
                          >
                            <div>
                              <label className="block text-xs font-medium mb-1">{t('proposal.your.price')}</label>
                              <div className="relative">
                                <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                  type="number"
                                  value={price}
                                  onChange={e => setPrice(e.target.value)}
                                  placeholder={String(budget)}
                                  className="w-full ps-10 pe-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">{t('proposal.comment')}</label>
                              <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                rows={3}
                                placeholder={t('proposal.comment.placeholder')}
                                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                              />
                            </div>
                            <button
                              onClick={handleSubmitProposal}
                              disabled={submitting || !price}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              {t('proposal.submit')}
                            </button>
                          </motion.div>
                        ) : (
                          <button
                            onClick={() => setShowForm(true)}
                            className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity"
                          >
                            {t('tasks.respond')}
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </>
              )}

              {isOwner && !escrow && (
                <p className="text-xs text-muted-foreground mt-4 text-center">{t('proposal.own.task')}</p>
              )}

              {/* Escrow status card */}
              {escrow && (
                <div className="mt-4 p-4 rounded-xl border border-border bg-secondary/50 space-y-3">
                  <div className="flex items-center gap-2">
                    {escrow.status === 'held' ? (
                      <Lock className="w-4 h-4 text-amber-600" />
                    ) : escrow.status === 'released' ? (
                      <Unlock className="w-4 h-4 text-primary" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    )}
                    <span className="text-sm font-semibold">
                      {t(`escrow.status.${escrow.status}`)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>{t('escrow.amount')}</span>
                      <span className="font-medium text-foreground">{formatPrice(escrow.amount, currency, escrow.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('escrow.commission')} ({Math.round(escrow.commission_rate * 100)}%)</span>
                      <span className="font-medium text-foreground">{formatPrice(escrow.commission_amount, currency, escrow.currency)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1">
                      <span className="font-medium">{t('escrow.net')}</span>
                      <span className="font-bold text-primary">{formatPrice(escrow.net_amount, currency, escrow.currency)}</span>
                    </div>
                  </div>

                  {isOwner && escrow.status === 'held' && task.status === 'in_progress' && (
                    <button
                      onClick={handleCompleteTask}
                      disabled={completing}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {t('escrow.complete')}
                    </button>
                  )}

                  {escrow.status === 'released' && (
                    <div className="flex items-center gap-2 text-xs text-primary font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('escrow.paymentReleased')}
                    </div>
                  )}
                </div>
              )}

              {/* Chat button */}
              {task.status === 'in_progress' && user && (task.user_id === user.id || task.assigned_to === user.id) && (
                <Link
                  to={`/chat/${id}`}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                >
                  <MessageSquare className="w-4 h-4 text-primary" />
                  {t('chat.openChat')}
                </Link>
              )}

              <div className="mt-5 pt-5 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{ownerName}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-primary font-medium">
                <Shield className="w-4 h-4" />
                {t('escrow.protected')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Dialog Overlay */}
      <AnimatePresence>
        {showPaymentDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !paymentProcessing && setShowPaymentDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4"
            >
              <div className="text-center">
                <CreditCard className="w-8 h-8 text-primary mx-auto mb-2" />
                <h3 className="font-bold text-lg">{t('payment.title')}</h3>
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 mt-2 inline-block">
                  {t('payment.demo')}
                </p>
              </div>

              {/* Amount */}
              {pendingAcceptProposalId && (() => {
                const p = proposals.find(pr => pr.id === pendingAcceptProposalId);
                return p ? (
                  <div className="text-center text-2xl font-bold text-primary">
                    {formatPrice(p.price, currency, p.currency)}
                  </div>
                ) : null;
              })()}

              {/* Card form (mock) */}
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder={t('payment.cardNumber')}
                  maxLength={19}
                  className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm"
                  defaultValue="4242 4242 4242 4242"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder={t('payment.expiry')}
                    maxLength={5}
                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm"
                    defaultValue="12/28"
                  />
                  <input
                    type="text"
                    placeholder={t('payment.cvc')}
                    maxLength={4}
                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm"
                    defaultValue="123"
                  />
                </div>
              </div>

              <button
                onClick={handlePaymentConfirm}
                disabled={paymentProcessing}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {paymentProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('payment.processing')}
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    {t('payment.pay')}
                  </>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TaskDetailPage;
