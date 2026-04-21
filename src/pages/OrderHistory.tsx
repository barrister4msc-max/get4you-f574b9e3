import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { ArrowLeft, CheckCircle2, Clock, XCircle, Filter, Download } from 'lucide-react';

type StatusFilter = 'all' | 'released' | 'held' | 'refunded';

interface HistoryRow {
  escrow_id: string;
  task_id: string;
  task_title: string | null;
  client_id: string;
  amount: number;
  net_amount: number;
  commission_amount: number;
  commission_rate: number;
  currency: string;
  status: string;
  held_at: string;
  released_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

const statusIcon = (status: string) => {
  if (status === 'released') return <CheckCircle2 className="w-4 h-4 text-primary" />;
  if (status === 'refunded') return <XCircle className="w-4 h-4 text-destructive" />;
  return <Clock className="w-4 h-4 text-amber-600" />;
};

const statusBadge = (status: string) => {
  if (status === 'released') return 'bg-emerald-50 text-primary';
  if (status === 'refunded') return 'bg-red-50 text-destructive';
  return 'bg-amber-50 text-amber-600';
};

const OrderHistoryPage = () => {
  const { user } = useAuth();
  const { t, currency } = useLanguage();
  const formatPrice = useFormatPrice();
  const navigate = useNavigate();

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodDays, setPeriodDays] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_tasker_order_history' as never, {
        _user_id: user.id,
      } as never);
      if (cancelled) return;
      if (error) {
        setRows([]);
      } else {
        setRows((data as unknown as HistoryRow[]) || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    if (periodDays !== 'all') {
      const cutoff = Date.now() - Number(periodDays) * 86400_000;
      list = list.filter((r) => new Date(r.created_at).getTime() >= cutoff);
    }
    return list;
  }, [rows, statusFilter, periodDays]);

  const totals = useMemo(() => {
    const released = filtered.filter((r) => r.status === 'released');
    return {
      count: released.length,
      gross: released.reduce((s, r) => s + Number(r.amount), 0),
      net: released.reduce((s, r) => s + Number(r.net_amount), 0),
      commission: released.reduce((s, r) => s + Number(r.commission_amount), 0),
    };
  }, [filtered]);

  const exportCsv = () => {
    const header = ['date', 'task', 'amount', 'commission', 'commission_rate', 'net', 'currency', 'status'].join(',');
    const lines = filtered.map((r) => [
      new Date(r.created_at).toISOString(),
      `"${(r.task_title || '').replace(/"/g, '""')}"`,
      r.amount,
      r.commission_amount,
      r.commission_rate,
      r.net_amount,
      r.currency,
      r.status,
    ].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-[80vh] py-8">
      <div className="container max-w-3xl mx-auto px-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> {t('history.back')}
        </button>

        <h1 className="text-2xl font-bold mb-2" data-testid="order-history-title">
          {t('history.title')}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">{t('history.subtitle')}</p>

        {/* Totals */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-xl font-bold text-primary">{totals.count}</p>
            <p className="text-xs text-muted-foreground">{t('history.completed')}</p>
          </div>
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-base font-bold">{formatPrice(totals.gross, currency, filtered[0]?.currency || 'ILS')}</p>
            <p className="text-xs text-muted-foreground">{t('history.gross')}</p>
          </div>
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-base font-bold text-amber-600">−{formatPrice(totals.commission, currency, filtered[0]?.currency || 'ILS')}</p>
            <p className="text-xs text-muted-foreground">{t('history.commission')}</p>
          </div>
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-base font-bold text-primary">{formatPrice(totals.net, currency, filtered[0]?.currency || 'ILS')}</p>
            <p className="text-xs text-muted-foreground">{t('history.net')}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm"
            data-testid="filter-status"
          >
            <option value="all">{t('history.filter.allStatuses')}</option>
            <option value="released">{t('escrow.status.released')}</option>
            <option value="held">{t('escrow.status.held')}</option>
            <option value="refunded">{t('escrow.status.refunded')}</option>
          </select>
          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(e.target.value)}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm"
            data-testid="filter-period"
          >
            <option value="all">{t('history.filter.allTime')}</option>
            <option value="7">{t('history.filter.7d')}</option>
            <option value="30">{t('history.filter.30d')}</option>
            <option value="90">{t('history.filter.90d')}</option>
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>

        {/* Rows */}
        {loading ? (
          <p className="text-center text-muted-foreground py-12">{t('dashboard.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12" data-testid="history-empty">
            {t('history.empty')}
          </p>
        ) : (
          <div className="space-y-2" data-testid="history-list">
            {filtered.map((r) => (
              <Link
                key={r.escrow_id}
                to={`/tasks/${r.task_id}`}
                className="block p-4 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {statusIcon(r.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{r.task_title || '—'}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                      <span className={`font-medium px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>
                        {t(`escrow.status.${r.status}`) || r.status}
                      </span>
                      <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                      <span className="text-muted-foreground">
                        · {t('history.commission')} {Math.round(r.commission_rate * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-sm font-bold text-primary">
                      {formatPrice(Number(r.net_amount), currency, r.currency)}
                    </p>
                    <p className="text-[11px] text-muted-foreground line-through">
                      {formatPrice(Number(r.amount), currency, r.currency)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderHistoryPage;
