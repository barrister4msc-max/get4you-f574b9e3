import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { supabase } from '@/integrations/supabase/client';
import { getCachedTranslation, setCachedTranslations } from '@/lib/translationCache';
import { trackEvent, extractProposalErrorCode } from '@/lib/analytics';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Clock, User, Shield, ArrowRight, Play, ImageIcon,
  Send, DollarSign, CheckCircle2, XCircle, Loader2, MessageCircle,
  Lock, Unlock, AlertTriangle, MessageSquare, CreditCard, Star,
  Pencil, Save, X,
} from 'lucide-react';

function TaskerRecentHistory({ taskerId }: { taskerId: string }) {
  const [items, setItems] = useState<Array<{ task_title: string | null; released_at: string | null }>>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_tasker_public_history' as never, {
        _tasker_id: taskerId, _limit: 5,
      } as never);
      if (cancelled) return;
      setItems((data as any[]) || []);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [taskerId]);
  if (!loaded) return <p className="text-xs text-muted-foreground mt-2">…</p>;
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-muted-foreground bg-muted/40 rounded-lg p-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-center justify-between gap-2">
          <span className="truncate">✓ {it.task_title || '—'}</span>
          {it.released_at && <span className="text-[10px] shrink-0">{new Date(it.released_at).toLocaleDateString()}</span>}
        </li>
      ))}
    </ul>
  );
}

interface Proposal {
  id: string;
  user_id: string;
  price: number;
  comment: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  currency: string | null;
  created_at: string;
  profile?: { display_name: string | null; avatar_url: string | null; bio: string | null; city: string | null } | null;
  avgRating?: number | null;
  reviewCount?: number;
  lastSeenAt?: string | null;
  completedOrders?: number;
}

const TaskDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, currency, locale } = useLanguage();
  const formatPrice = useFormatPrice();
  const { user, roles, refreshProfile } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [ownerProfile, setOwnerProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [assignedProfile, setAssignedProfile] = useState<{ display_name: string | null; avatar_url: string | null; bio: string | null; city: string | null } | null>(null);
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

  // Edit proposal state
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [editProposalPrice, setEditProposalPrice] = useState('');
  const [editProposalComment, setEditProposalComment] = useState('');

  // Escrow state
  const [escrow, setEscrow] = useState<any>(null);
  const [completing, setCompleting] = useState(false);

  // Payment dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [pendingAcceptProposalId, setPendingAcceptProposalId] = useState<string | null>(null);

  // Translation state
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(null);
  const [translatedDescription, setTranslatedDescription] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [saving, setSaving] = useState(false);

  // Review state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [existingReview, setExistingReview] = useState<any>(null);

  // Dispute state
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  const isOwner = user?.id === task?.user_id;
  const isAssignedTasker = user?.id === task?.assigned_to;
  const hasProposed = proposals.some(p => p.user_id === user?.id && p.status !== 'rejected');

  const fetchTask = async () => {
    if (!id) return;
    // Try the full tasks table first (works for owner / assignee / admin).
    let { data } = await supabase
      .from('tasks')
      .select('*, categories(name_en, name_ru, name_he)')
      .eq('id', id)
      .maybeSingle();

    // Fallback to public view (open tasks visible to all, hides address/coords).
    if (!data) {
      const pub = await supabase
        .from('tasks_public' as any)
        .select('*, categories(name_en, name_ru, name_he)')
        .eq('id', id)
        .maybeSingle();
      data = pub.data as any;
    }

    if (data?.user_id) {
      const { data: profile } = await supabase.rpc('get_public_profile', { target_user_id: data.user_id });
      setOwnerProfile(profile?.[0] || null);
    }

    if (data?.assigned_to) {
      const [profileRes, reviewsRes] = await Promise.all([
        supabase.rpc('get_public_profile', { target_user_id: data.assigned_to }),
        supabase.from('reviews').select('rating').eq('reviewee_id', data.assigned_to),
      ]);
      setAssignedProfile(profileRes.data?.[0] || null);
      const ratings = reviewsRes.data || [];
      if (ratings.length > 0) {
        const avg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
        setAssignedRating({ avg, count: ratings.length });
      } else {
        setAssignedRating({ avg: null, count: 0 });
      }
    } else {
      setAssignedProfile(null);
      setAssignedRating({ avg: null, count: 0 });
    }

    setTask(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTask();
  }, [id]);

  // Translate task title & description when locale changes
  useEffect(() => {
    if (!task) return;
    // Check cache first
    const cached = getCachedTranslation(locale, task.id);
    if (cached) {
      setTranslatedTitle(cached.title);
      setTranslatedDescription(cached.description);
      return;
    }
    setTranslatedTitle(null);
    setTranslatedDescription(null);
    let cancelled = false;
    const doTranslate = async () => {
      const { data, error } = await supabase.functions.invoke('ai-task-assistant', {
        body: {
          type: 'translate_tasks',
          targetLocale: locale,
          tasks: [{ id: task.id, title: task.title, description: task.description }],
        },
      });
      if (cancelled || error || !data?.translations?.[0]) return;
      const tr = data.translations[0];
      setCachedTranslations(locale, [{ id: tr.id, title: tr.title || task.title, description: tr.description ?? task.description }]);
      setTranslatedTitle(tr.title || task.title);
      setTranslatedDescription(tr.description ?? task.description);
    };
    doTranslate().catch(() => undefined);
    return () => { cancelled = true; };
  }, [task?.id, task?.title, task?.description, locale]);

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
        const [profilesRes, reviewsRes, lastSeenRes, completedRes] = await Promise.all([
          supabase.rpc('get_public_profiles', { target_user_ids: userIds }),
          supabase.from('reviews').select('reviewee_id, rating').in('reviewee_id', userIds),
          supabase.from('profiles').select('user_id, last_seen_at').in('user_id', userIds),
          supabase.from('escrow_transactions').select('tasker_id, status').in('tasker_id', userIds).eq('status', 'released'),
        ]);

        const profileMap = new Map(profilesRes.data?.map(p => [p.user_id, p]) || []);
        const lastSeenMap = new Map(lastSeenRes.data?.map(p => [p.user_id, p.last_seen_at]) || []);
        const completedMap = new Map<string, number>();
        (completedRes.data || []).forEach((row: any) => {
          completedMap.set(row.tasker_id, (completedMap.get(row.tasker_id) || 0) + 1);
        });
        
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
          lastSeenAt: lastSeenMap.get(p.user_id) || null,
          completedOrders: completedMap.get(p.user_id) || 0,
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
      setEscrow(data || null);
    };

    fetchEscrow();

    const escrowChannel = supabase
      .channel(`task-escrow-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'escrow_transactions', filter: `task_id=eq.${id}` },
        () => {
          fetchEscrow();
        }
      )
      .subscribe();

    const taskChannel = supabase
      .channel(`task-status-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `id=eq.${id}` },
        () => {
          fetchTask();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(escrowChannel);
      supabase.removeChannel(taskChannel);
    };
  }, [id]);

  // Fetch existing review by current user for this task
  useEffect(() => {
    if (!id || !user) return;
    supabase
      .from('reviews')
      .select('*')
      .eq('task_id', id)
      .eq('reviewer_id', user.id)
      .maybeSingle()
      .then(({ data }) => setExistingReview(data || null));
  }, [id, user]);

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

  const handleSubmitReview = async () => {
    if (!id || !user || reviewRating === 0) return;
    // Determine who is being reviewed
    const revieweeId = isOwner ? task.assigned_to : task.user_id;
    if (!revieweeId) return;
    setReviewSubmitting(true);
    try {
      const { data, error } = await supabase.from('reviews').insert({
        task_id: id,
        reviewer_id: user.id,
        reviewee_id: revieweeId,
        rating: reviewRating,
        comment: reviewComment.trim() || null,
      }).select().single();
      if (error) throw error;
      setExistingReview(data);
      toast.success(t('review.submitted'));
    } catch {
      toast.error(t('review.error'));
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleSubmitDispute = async () => {
    if (!id || !user || !disputeReason.trim()) return;
    setDisputeSubmitting(true);
    try {
      const { error } = await supabase.from('complaints').insert({
        task_id: id,
        user_id: user.id,
        reason: disputeReason.trim(),
        status: 'open',
      });
      if (error) throw error;
      await supabase.from('tasks').update({ status: 'dispute' }).eq('id', id);
      setTask((prev: any) => ({ ...prev, status: 'dispute' }));
      setShowDisputeForm(false);
      setDisputeReason('');
      toast.success(t('dispute.submitted'));
    } catch {
      toast.error(t('dispute.error'));
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const handleEditProposal = (proposal: Proposal) => {
    setEditingProposalId(proposal.id);
    setEditProposalPrice(String(proposal.price));
    setEditProposalComment(proposal.comment || '');
  };

  const handleSubmitProposal = async () => {
    if (!id || !user || !price) return;
    setSubmitting(true);
    try {
      // Idempotent RPC: returns existing active proposal id if user already
      // submitted one, otherwise creates a new proposal. Safe against double-clicks
      // and race conditions thanks to advisory lock + unique partial index.
      const { error } = await supabase.rpc('submit_proposal', {
        _task_id: id,
        _price: Number(price),
        _currency: task?.currency || currency || 'ILS',
        _comment: comment.trim() || null,
        _portfolio_urls: null,
      });
      if (error) throw error;
      toast.success(t('proposal.submitted'));
      setShowForm(false);
      setPrice('');
      setComment('');
      // Reload proposals
      const { data } = await supabase
        .from('proposals')
        .select('*')
        .eq('task_id', id)
        .order('created_at', { ascending: false });
      if (data) setProposals(data as any);
    } catch (err: any) {
      console.error('submit proposal error:', err);
      const code = extractProposalErrorCode(err);
      const i18nKey = code ? `proposal.error.${code}` : 'proposal.error';
      toast.error(t(i18nKey));
      // Server already logs proposal_rejected; we still emit a client-side
      // event so funnel covers fatal/network errors too.
      void trackEvent('proposal_rejected', {
        taskId: id,
        metadata: { reason: code || 'CLIENT_ERROR', source: 'client' },
      });
    } finally {
      setSubmitting(false);
    }
  };



  const handleSaveProposalEdit = async () => {
    if (!editingProposalId || !editProposalPrice) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('proposals').update({
        price: Number(editProposalPrice),
        comment: editProposalComment.trim() || null,
      }).eq('id', editingProposalId);
      if (error) throw error;
      setProposals(prev => prev.map(p =>
        p.id === editingProposalId
          ? { ...p, price: Number(editProposalPrice), comment: editProposalComment.trim() || null }
          : p
      ));
      setEditingProposalId(null);
      toast.success(t('proposal.updated'));
    } catch {
      toast.error(t('proposal.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = () => {
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditBudget(String(task.budget_fixed || task.budget_min || ''));
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (editTitle.trim() && editTitle !== task.title) updates.title = editTitle.trim();
      if (editDescription !== (task.description || '')) updates.description = editDescription.trim() || null;
      const newBudget = Number(editBudget);
      if (newBudget > 0 && newBudget !== (task.budget_fixed || task.budget_min)) {
        updates.budget_fixed = newBudget;
      }
      if (Object.keys(updates).length === 0) {
        setEditing(false);
        return;
      }
      const { error } = await supabase.from('tasks').update(updates).eq('id', id);
      if (error) throw error;
      setTask((prev: any) => ({ ...prev, ...updates }));
      // Reset rejected proposals so those taskers can re-propose
      const rejectedIds = proposals.filter(p => p.status === 'rejected').map(p => p.id);
      if (rejectedIds.length > 0) {
        await supabase.from('proposals').delete().in('id', rejectedIds);
        setProposals(prev => prev.filter(p => p.status !== 'rejected'));
      }
      setEditing(false);
      toast.success(t('task.edit.saved'));
    } catch {
      toast.error(t('task.edit.error'));
    } finally {
      setSaving(false);
    }
  };


const handleUpdateProposal = async (
  proposalId: string,
  status: "accepted" | "rejected"
) => {
  setUpdating(proposalId);

  try {
    const { error } = await supabase
      .from("proposals")
      .update({ status })
      .eq("id", proposalId);

    if (error) throw error;

    setProposals((prev) =>
      prev.map((p) => (p.id === proposalId ? { ...p, status } : p))
    );

    toast.success(
      status === "accepted" ? t("proposal.accepted") : t("proposal.rejected")
    );
  } catch (error) {
    console.error("Failed to update proposal:", error);
    toast.error(t("proposal.error"));
    throw new Error("proposal_update_failed");
  } finally {
    setUpdating(null);
  }
};
const handleAcceptClick = (proposalId: string) => {
  const proposal = proposals.find((p) => p.id === proposalId);

  if (!proposal) return;

  const canPay =
    (proposal.status === "pending" || proposal.status === "accepted") &&
    task?.status === "open";

  if (!canPay) {
    toast.error("Нельзя оплатить этот отклик");
    return;
  }

  setPendingAcceptProposalId(proposalId);
  setShowPaymentDialog(true);
};

const handlePaymentConfirm = async () => {
  if (!pendingAcceptProposalId || !id) return;

  setPaymentProcessing(true);

  try {
    const proposal = proposals.find((p) => p.id === pendingAcceptProposalId);
    if (!proposal) throw new Error("Proposal not found");

    const baseUrl = window.location.origin;

    const { data, error } = await supabase.functions.invoke("create-payment", {
      body: {
        task_id: id,
        proposal_id: pendingAcceptProposalId,
        currency: proposal.currency || currency || "ILS",
        success_url: `${baseUrl}/payment-success`,
        cancel_url: `${baseUrl}/payment-cancel`,
        lang: locale === "ru" ? "RU" : locale === "he" ? "HE" : "EN",
      },
    });

    if (error) throw error;

    if (data?.payment_url) {
      setPendingAcceptProposalId(null);
      setShowPaymentDialog(false);
      window.location.href = data.payment_url;
      return;
    }

    throw new Error(data?.error || "No payment URL returned");
  } catch (err: any) {
    console.error("Payment error:", err);
    toast.error(err.message || t("payment.error"));
  } finally {
    setPaymentProcessing(false);
  }
};

  if (loading) {
    return (
      <div className="py-8">
        <div className="container max-w-4xl text-center text-muted-foreground py-20">{t('dashboard.loading')}</div>
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
              <div className="flex items-center gap-2">
                {editing ? (
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="text-xl font-bold w-full border border-input rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                ) : (
                  <h1 className="text-xl font-bold">{translatedTitle || task.title}</h1>
                )}
                {isOwner && task.status === 'open' && !editing && (
                  <button onClick={handleStartEdit} className="shrink-0 p-1.5 rounded-lg hover:bg-secondary transition-colors" title={t('task.edit')}>
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              {editing ? (
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={4}
                  className="mt-3 w-full text-sm border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  placeholder={t('task.description')}
                />
              ) : (
                (translatedDescription ?? task.description) && (
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{translatedDescription ?? task.description}</p>
                )
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
                          <div className="font-semibold text-sm flex items-center gap-2">
                            {proposal.profile?.display_name || 'User'}
                            {(() => {
                              if (!proposal.lastSeenAt) return null;
                              const diff = Date.now() - new Date(proposal.lastSeenAt).getTime();
                              const mins = Math.floor(diff / 60000);
                              if (mins < 5) return (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Online
                                </span>
                              );
                              if (mins < 60) return (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                                  ⏱ {mins}m
                                </span>
                              );
                              return null;
                            })()}
                          </div>
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
                            {(proposal.completedOrders ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-primary font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                {proposal.completedOrders} {t('proposal.completedShort') || 'выполнено'}
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

                    {/* Tasker recent completed orders for task owner */}
                    {isOwner && (proposal.completedOrders ?? 0) > 0 && (
                      <details className="mt-2 group" data-testid={`tasker-history-${proposal.id}`}>
                        <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">
                          {t('history.taskerHistory')} ({proposal.completedOrders})
                        </summary>
                        <TaskerRecentHistory taskerId={proposal.user_id} />
                      </details>
                    )}

                    {/* Editable proposal for own pending proposals */}
                    {editingProposalId === proposal.id ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={editProposalPrice}
                            onChange={e => setEditProposalPrice(e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <textarea
                          value={editProposalComment}
                          onChange={e => setEditProposalComment(e.target.value)}
                          rows={2}
                          placeholder={t('proposal.comment.placeholder')}
                          className="w-full px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveProposalEdit}
                            disabled={submitting || !editProposalPrice}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            {t('proposal.editSave')}
                          </button>
                          <button
                            onClick={() => setEditingProposalId(null)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-secondary"
                          >
                            <X className="w-3 h-3" />
                            {t('payment.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {proposal.comment && (
                          <p className="text-sm text-muted-foreground mt-2">{proposal.comment}</p>
                        )}

                        {/* Edit button for own pending proposals */}
                        {proposal.user_id === user?.id && proposal.status === 'pending' && task.status === 'open' && (
                          <button
                            onClick={() => handleEditProposal(proposal)}
                            className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-secondary transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            {t('proposal.edit')}
                          </button>
                        )}
                      </>
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
              {editing ? (
                <div>
                  <label className="block text-xs font-medium mb-1">{t('task.budget')}</label>
                  <div className="relative">
                    <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="number"
                      value={editBudget}
                      onChange={e => setEditBudget(e.target.value)}
                      className="w-full ps-10 pe-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {t('task.edit.save')}
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:bg-secondary"
                    >
                      <X className="w-3 h-3" />
                      {t('payment.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-primary">{formatPrice(budget, currency, task.currency)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('task.budget')}</p>
                </>
              )}

              {/* Offer button / form */}
              {!isOwner && task.status === 'open' && (
                <>
                  {!user ? (
                    <button
                      onClick={() => {
                        void trackEvent('respond_clicked', {
                          taskId: id,
                          metadata: { state: 'guest' },
                        });
                        navigate(`/login?tab=signup&returnTo=${encodeURIComponent(`/tasks/${id}`)}`);
                      }}
                      className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity"
                    >
                      {t('tasks.respond')}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : !user.email_confirmed_at ? (
                    <button
                      onClick={() => {
                        void trackEvent('respond_clicked', {
                          taskId: id,
                          metadata: { state: 'unverified' },
                        });
                        navigate(`/login?returnTo=${encodeURIComponent(`/tasks/${id}`)}`);
                      }}
                      className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity"
                    >
                      {t('tasks.respond')}
                      <ArrowRight className="w-4 h-4" />
                    </button>
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
                            onClick={() => {
                              void trackEvent('respond_clicked', {
                                taskId: id,
                                metadata: { state: 'authenticated' },
                              });
                              setShowForm(true);
                            }}
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

                  {/* Dispute button */}
                  {isOwner && escrow.status === 'held' && task.status === 'in_progress' && (
                    <>
                      {showDisputeForm ? (
                        <div className="space-y-2 mt-2">
                          <textarea
                            value={disputeReason}
                            onChange={e => setDisputeReason(e.target.value)}
                            rows={3}
                            placeholder={t('dispute.reasonPlaceholder')}
                            className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-destructive/20 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleSubmitDispute}
                              disabled={disputeSubmitting || !disputeReason.trim()}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                            >
                              {disputeSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                              {t('dispute.submit')}
                            </button>
                            <button
                              onClick={() => { setShowDisputeForm(false); setDisputeReason(''); }}
                              className="flex-1 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:bg-secondary"
                            >
                              {t('payment.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowDisputeForm(true)}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {t('dispute.openDispute')}
                        </button>
                      )}
                    </>
                  )}

                  {task.status === 'dispute' && (
                    <div className="flex items-center gap-2 text-xs text-destructive font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {t('dispute.inProgress')}
                    </div>
                  )}

                  {escrow.status === 'released' && (
                    <div className="flex items-center gap-2 text-xs text-primary font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('escrow.paymentReleased')}
                    </div>
                  )}
                </div>
              )}

              {/* Review form after completion - for both owner and assigned tasker */}
              {(isOwner || isAssignedTasker) && task.status === 'completed' && !existingReview && (
                <div className="mt-4 p-4 rounded-xl border border-border bg-secondary/50 space-y-3">
                  <p className="text-sm font-semibold">
                    {isOwner ? t('review.leaveReview') : t('review.leaveReviewClient')}
                  </p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onClick={() => setReviewRating(star)}
                        className="p-0.5"
                      >
                        <Star className={`w-6 h-6 ${star <= reviewRating ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)}
                    rows={2}
                    placeholder={t('review.commentPlaceholder')}
                    className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                  <button
                    onClick={handleSubmitReview}
                    disabled={reviewSubmitting || reviewRating === 0}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {reviewSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                    {t('review.submit')}
                  </button>
                </div>
              )}

              {/* Existing review display */}
              {existingReview && (
                <div className="mt-4 p-4 rounded-xl border border-border bg-secondary/50 space-y-2">
                  <p className="text-sm font-semibold">{t('review.yourReview')}</p>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star key={star} className={`w-4 h-4 ${star <= existingReview.rating ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'}`} />
                    ))}
                  </div>
                  {existingReview.comment && <p className="text-xs text-muted-foreground">{existingReview.comment}</p>}
                </div>
              )}

              {/* Chat button — only for active tasks */}
              {user && (task.status === 'in_progress' || task.status === 'completed' || task.status === 'dispute') &&
                (task.user_id === user.id || task.assigned_to === user.id) && (
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

              {/* Assigned tasker profile */}
              {task.assigned_to && assignedProfile && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{t('task.assignedTasker')}</p>
                  <div className="flex items-center gap-3">
                    {assignedProfile.avatar_url ? (
                      <img src={assignedProfile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-border" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                        <User className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-sm">{assignedProfile.display_name || 'Tasker'}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {assignedProfile.city && (
                          <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{assignedProfile.city}</span>
                        )}
                        {assignedRating.avg && (
                          <span className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                            {assignedRating.avg.toFixed(1)} ({assignedRating.count})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {assignedProfile.bio && (
                    <p className="text-xs text-muted-foreground mt-2">{assignedProfile.bio}</p>
                  )}
                </div>
              )}

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
                <p className="text-xs text-muted-foreground mt-2">
                  {t('payment.redirect')}
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
                    <CreditCard className="w-4 h-4" />
                    {t('payment.pay')}
                  </>
                )}
              </button>
              <button
                onClick={() => { setShowPaymentDialog(false); setPendingAcceptProposalId(null); }}
                disabled={paymentProcessing}
                className="w-full py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                {t('payment.cancel')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TaskDetailPage;
