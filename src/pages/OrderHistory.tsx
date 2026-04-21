import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, Filter, Download,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

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

const PAGE_SIZE = 20;

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
  const { rates } = useExchangeRates();
  const navigate = useNavigate();

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodDays, setPeriodDays] = useState<string>('all');
  const [page, setPage] = useState(1);

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

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [statusFilter, periodDays]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    if (periodDays !== 'all') {
      const cutoff = Date.now() - Number(periodDays) * 86400_000;
      list = list.filter((r) => new Date(r.created_at).getTime() >= cutoff);
    }
    return list;
  }, [rows, statusFilter, periodDays]);

  // Convert all amounts into the user's display currency for accurate totals.
  const totals = useMemo(() => {
    const released = filtered.filter((r) => r.status === 'released');
    const convert = (value: number, from: string) => {
      if (!rates || from === currency) return value;
      const fromRate = rates[from] ?? 1;
      const toRate = rates[currency] ?? 1;
      // rates are stored relative to USD: amount_in_USD = value / fromRate
      const usd = fromRate ? value / fromRate : value;
      return usd * toRate;
    };
    let gross = 0, net = 0, commission = 0;
    for (const r of released) {
      const cur = (r.currency || 'ILS').toUpperCase();
      gross += convert(Number(r.amount), cur);
      net += convert(Number(r.net_amount), cur);
      commission += convert(Number(r.commission_amount), cur);
    }
    const avgRate = released.length
      ? released.reduce((s, r) => s + Number(r.commission_rate), 0) / released.length
      : 0;
    return { count: released.length, gross, net, commission, avgRate };
  }, [filtered, rates, currency]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

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

        {/* Totals — already converted into the user's display currency */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" data-testid="history-totals">
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-xl font-bold text-primary">{totals.count}</p>
            <p className="text-xs text-muted-foreground">{t('history.completed')}</p>
          </div>
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-base font-bold">{formatPrice(totals.gross, currency, currency)}</p>
            <p className="text-xs text-muted-foreground">{t('history.gross')}</p>
          </div>
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-base font-bold text-amber-600">−{formatPrice(totals.commission, currency, currency)}</p>
            <p className="text-xs text-muted-foreground">
              {t('history.commission')}
              {totals.avgRate > 0 && ` · ${Math.round(totals.avgRate * 100)}%`}
            </p>
          </div>
          <div className="p-3 rounded-2xl border border-border bg-card text-center">
            <p className="text-base font-bold text-primary">{formatPrice(totals.net, currency, currency)}</p>
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
          <span className="text-xs text-muted-foreground" data-testid="history-count">
            {filtered.length} {t('history.totalShown') || ''}
          </span>
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
          <>
            <div className="space-y-2" data-testid="history-list">
              {pageItems.map((r) => (
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

            {/* Pagination */}
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6" data-testid="history-pagination">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-secondary"
                >
                  <ChevronLeft className="w-4 h-4" /> {t('history.prev') || 'Назад'}
                </button>
                <span className="text-sm text-muted-foreground" data-testid="history-page-indicator">
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                  className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-secondary"
                >
                  {t('history.next') || 'Далее'} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OrderHistoryPage;
