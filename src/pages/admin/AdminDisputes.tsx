import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, XCircle, Loader2, MessageSquare, User } from 'lucide-react';
import {
  adminRefundEscrow,
  adminReleaseEscrow,
  closeDisputeWithoutPayout,
} from '@/lib/api/protectedWrites';
import { friendlyErrorMessage } from '@/lib/api/friendlyError';

interface Dispute {
  id: string;
  task_id: string | null;
  user_id: string;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  task_title?: string;
  client_name?: string;
  tasker_name?: string;
  client_id?: string;
  tasker_id?: string;
  escrow_id?: string;
}

interface EscrowDispute {
  id: string;
  assignment_id: string;
  task_id: string;
  escrow_id: string | null;
  opened_by: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  task_title?: string;
  client_id?: string;
  tasker_id?: string;
  client_name?: string;
  tasker_name?: string;
  opened_by_name?: string;
  escrow_status?: string | null;
}

const AdminDisputes = () => {
  const { t } = useLanguage();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [escrowDisputes, setEscrowDisputes] = useState<EscrowDispute[]>([]);
  const [escrowNotes, setEscrowNotes] = useState<Record<string, string>>({});
  const [escrowActionId, setEscrowActionId] = useState<string | null>(null);

  useEffect(() => {
    fetchDisputes();
    fetchEscrowDisputes();
  }, []);

  const fetchDisputes = async () => {
    setLoading(true);
    const { data: complaints } = await supabase
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false });

    if (!complaints) { setLoading(false); return; }

    // Get task info for each complaint
    const taskIds = [...new Set(complaints.filter(c => c.task_id).map(c => c.task_id!))];
    const [tasksRes, profilesMap] = await Promise.all([
      taskIds.length > 0
        ? supabase.from('tasks').select('id, title, user_id, assigned_to').in('id', taskIds)
        : Promise.resolve({ data: [] }),
      Promise.resolve(new Map<string, string>()),
    ]);

    const tasks = tasksRes.data || [];
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    // Get all user IDs for profiles
    const userIds = new Set<string>();
    complaints.forEach(c => userIds.add(c.user_id));
    tasks.forEach(t => { userIds.add(t.user_id); if (t.assigned_to) userIds.add(t.assigned_to); });

    const { data: profiles } = await supabase.rpc('get_public_profiles', {
      target_user_ids: [...userIds],
    });
    profiles?.forEach(p => profilesMap.set(p.user_id, p.display_name || 'User'));

    // Get escrow info
    const escrowMap = new Map<string, string>();
    if (taskIds.length > 0) {
      const { data: escrows } = await supabase
        .from('escrow_transactions')
        .select('id, task_id, status')
        .in('task_id', taskIds);
      escrows?.forEach(e => escrowMap.set(e.task_id, e.id));
    }

    const enriched: Dispute[] = complaints.map(c => {
      const task = c.task_id ? taskMap.get(c.task_id) : null;
      return {
        ...c,
        task_title: task?.title || '—',
        client_name: task ? profilesMap.get(task.user_id) || 'User' : '—',
        tasker_name: task?.assigned_to ? profilesMap.get(task.assigned_to) || 'User' : '—',
        client_id: task?.user_id,
        tasker_id: task?.assigned_to || undefined,
        escrow_id: c.task_id ? escrowMap.get(c.task_id) : undefined,
      };
    });

    setDisputes(enriched);
    setLoading(false);
  };

  const fetchEscrowDisputes = async () => {
    const { data: rows } = await supabase
      .from('disputes')
      .select('id, assignment_id, task_id, escrow_id, opened_by, reason, details, status, created_at')
      .order('created_at', { ascending: false });
    if (!rows) return;

    const taskIds = [...new Set(rows.map((r) => r.task_id).filter(Boolean) as string[])];
    const assignmentIds = [...new Set(rows.map((r) => r.assignment_id).filter(Boolean) as string[])];
    const escrowIds = [...new Set(rows.map((r) => r.escrow_id).filter(Boolean) as string[])];

    const [tasksRes, assignmentsRes, escrowsRes] = await Promise.all([
      taskIds.length
        ? supabase.from('tasks').select('id, title').in('id', taskIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
      assignmentIds.length
        ? supabase
            .from('task_assignments')
            .select('id, client_id, tasker_id')
            .in('id', assignmentIds)
        : Promise.resolve({
            data: [] as Array<{ id: string; client_id: string; tasker_id: string }>,
          }),
      escrowIds.length
        ? supabase.from('escrow_transactions').select('id, status').in('id', escrowIds)
        : Promise.resolve({ data: [] as Array<{ id: string; status: string }> }),
    ]);

    const taskMap = new Map<string, string>(
      ((tasksRes.data ?? []) as Array<{ id: string; title: string }>).map((t) => [t.id, t.title]),
    );
    type AssignmentLite = { id: string; client_id: string; tasker_id: string };
    const assignmentMap = new Map<string, AssignmentLite>(
      ((assignmentsRes.data ?? []) as AssignmentLite[]).map((a) => [a.id, a]),
    );
    const escrowMap = new Map<string, string>(
      ((escrowsRes.data ?? []) as Array<{ id: string; status: string }>).map((e) => [
        e.id,
        e.status,
      ]),
    );

    const userIds = new Set<string>();
    rows.forEach((r) => userIds.add(r.opened_by));
    assignmentMap.forEach((a) => {
      userIds.add(a.client_id);
      userIds.add(a.tasker_id);
    });
    const { data: profiles } = await supabase.rpc('get_public_profiles', {
      target_user_ids: [...userIds],
    });
    const nameMap = new Map<string, string>();
    profiles?.forEach((p) => nameMap.set(p.user_id, p.display_name || 'User'));

    const enriched: EscrowDispute[] = rows.map((r) => {
      const a = assignmentMap.get(r.assignment_id);
      return {
        ...r,
        task_title: taskMap.get(r.task_id) ?? '—',
        client_id: a?.client_id,
        tasker_id: a?.tasker_id,
        client_name: a ? nameMap.get(a.client_id) ?? 'User' : '—',
        tasker_name: a ? nameMap.get(a.tasker_id) ?? 'User' : '—',
        opened_by_name: nameMap.get(r.opened_by) ?? 'User',
        escrow_status: r.escrow_id ? escrowMap.get(r.escrow_id) ?? null : null,
      };
    });
    setEscrowDisputes(enriched);
  };

  const resolveEscrowDispute = async (
    dispute: EscrowDispute,
    favor: 'client' | 'tasker' | 'close',
  ) => {
    if (!dispute.task_id) return;
    setEscrowActionId(dispute.id);
    try {
      const note = escrowNotes[dispute.id]?.trim() || '';

      if (favor === 'client' && dispute.escrow_id) {
        const { error } = await adminRefundEscrow(dispute.escrow_id, dispute.task_id);
        if (error) throw error;
      } else if (favor === 'tasker' && dispute.escrow_id) {
        const { error } = await adminReleaseEscrow(dispute.escrow_id, dispute.task_id);
        if (error) throw error;
      }

      const { error: closeErr } = await closeDisputeWithoutPayout(
        dispute.id,
        note ||
          (favor === 'client'
            ? 'Resolved in favor of client'
            : favor === 'tasker'
              ? 'Resolved in favor of tasker'
              : 'Closed without payout'),
      );
      if (closeErr) throw closeErr;

      toast.success(
        favor === 'close'
          ? 'Dispute closed without payout'
          : `Dispute resolved in favor of ${favor}`,
      );
      fetchEscrowDisputes();
    } catch (err) {
      toast.error(friendlyErrorMessage(err, 'Failed to resolve dispute'));
    } finally {
      setEscrowActionId(null);
    }
  };

  const resolveDispute = async (dispute: Dispute, favor: 'client' | 'tasker') => {
    if (!dispute.task_id) return;
    setActionId(dispute.id);

    try {
      const note = adminNotes[dispute.id]?.trim() || '';

      if (favor === 'client' && dispute.escrow_id) {
        // Refund to client (TODO: route through admin-resolve-dispute Edge Function)
        const { error } = await adminRefundEscrow(dispute.escrow_id, dispute.task_id);
        if (error) throw error;
      } else if (favor === 'tasker' && dispute.escrow_id) {
        // Release to tasker (TODO: route through admin-resolve-dispute Edge Function)
        const { error } = await adminReleaseEscrow(dispute.escrow_id, dispute.task_id);
        if (error) throw error;
      }

      // Update complaint status
      await supabase.from('complaints')
        .update({
          status: `resolved_${favor}`,
          admin_note: note || `Resolved in favor of ${favor}`,
        })
        .eq('id', dispute.id);

      toast.success(`Dispute resolved in favor of ${favor}`);
      fetchDisputes();
    } catch {
      toast.error('Failed to resolve dispute');
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Disputes</h1>
        <span className="px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive rounded-full">
          {disputes.filter(d => d.status === 'open').length} open
        </span>
      </div>

      {/* Escrow-locking disputes (new flow) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">Escrow disputes</h2>
          <span className="px-2 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive rounded-full">
            {escrowDisputes.filter((d) => d.status === 'open').length} open
          </span>
        </div>
        {escrowDisputes.length === 0 ? (
          <p className="text-muted-foreground text-sm py-6 text-center border border-dashed border-border rounded-xl">
            No escrow disputes found
          </p>
        ) : (
          <div className="space-y-4">
            {escrowDisputes.map((d) => {
              const isOpen = d.status === 'open';
              return (
                <div
                  key={d.id}
                  className={`border rounded-xl p-5 space-y-3 transition-colors ${
                    isOpen ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                            isOpen ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                          }`}
                        >
                          {d.status}
                        </span>
                        {d.escrow_status && (
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-secondary text-foreground">
                            escrow: {d.escrow_status}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(d.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="font-semibold text-sm text-foreground truncate">{d.task_title}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3" />
                      <span>Client: <strong className="text-foreground">{d.client_name}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3" />
                      <span>Tasker: <strong className="text-foreground">{d.tasker_name}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Opened by: <strong className="text-foreground">{d.opened_by_name}</strong></span>
                    </div>
                  </div>

                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Reason:</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{d.reason}</p>
                    {d.details && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">{d.details}</p>
                    )}
                  </div>

                  {isOpen && (
                    <div className="space-y-3 pt-2">
                      <textarea
                        value={escrowNotes[d.id] || ''}
                        onChange={(e) =>
                          setEscrowNotes((prev) => ({ ...prev, [d.id]: e.target.value }))
                        }
                        placeholder="Admin note (optional)..."
                        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                        rows={2}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => resolveEscrowDispute(d, 'client')}
                          disabled={escrowActionId === d.id || !d.escrow_id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-secondary text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
                        >
                          {escrowActionId === d.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          Refund to Client
                        </button>
                        <button
                          onClick={() => resolveEscrowDispute(d, 'tasker')}
                          disabled={escrowActionId === d.id || !d.escrow_id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {escrowActionId === d.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          Release to Tasker
                        </button>
                        <button
                          onClick={() => resolveEscrowDispute(d, 'close')}
                          disabled={escrowActionId === d.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          {escrowActionId === d.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          Close without payout
                        </button>
                        {d.task_id && (
                          <a
                            href={`/admin/chat?taskId=${d.task_id}`}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-secondary transition-colors ml-auto"
                          >
                            <MessageSquare className="w-3 h-3" />
                            View Chat
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {disputes.length === 0 ? (
        <p className="text-muted-foreground text-sm py-12 text-center">No disputes found</p>
      ) : (
        <div className="space-y-4">
          {disputes.map(dispute => {
            const isOpen = dispute.status === 'open';
            const isResolved = dispute.status.startsWith('resolved');
            return (
              <div
                key={dispute.id}
                className={`border rounded-xl p-5 space-y-3 transition-colors ${
                  isOpen ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                        isOpen ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                      }`}>
                        {dispute.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(dispute.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="font-semibold text-sm text-foreground truncate">{dispute.task_title}</p>
                  </div>
                </div>

                {/* Participants */}
                <div className="flex gap-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3" />
                    <span>Client: <strong className="text-foreground">{dispute.client_name}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3" />
                    <span>Tasker: <strong className="text-foreground">{dispute.tasker_name}</strong></span>
                  </div>
                </div>

                {/* Reason */}
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Reason:</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{dispute.reason}</p>
                </div>

                {/* Admin note (if resolved) */}
                {dispute.admin_note && isResolved && (
                  <div className="bg-primary/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-primary mb-1">Admin note:</p>
                    <p className="text-sm text-foreground">{dispute.admin_note}</p>
                  </div>
                )}

                {/* Actions for open disputes */}
                {isOpen && (
                  <div className="space-y-3 pt-2">
                    <textarea
                      value={adminNotes[dispute.id] || ''}
                      onChange={e => setAdminNotes(prev => ({ ...prev, [dispute.id]: e.target.value }))}
                      placeholder="Admin note (optional)..."
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolveDispute(dispute, 'client')}
                        disabled={actionId === dispute.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-300"
                      >
                        {actionId === dispute.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                        Refund to Client
                      </button>
                      <button
                        onClick={() => resolveDispute(dispute, 'tasker')}
                        disabled={actionId === dispute.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors disabled:opacity-50 dark:bg-emerald-900/30 dark:text-emerald-300"
                      >
                        {actionId === dispute.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Release to Tasker
                      </button>
                      {dispute.task_id && (
                        <a
                          href={`/admin/chat?taskId=${dispute.task_id}`}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-secondary transition-colors ml-auto"
                        >
                          <MessageSquare className="w-3 h-3" />
                          View Chat
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminDisputes;
