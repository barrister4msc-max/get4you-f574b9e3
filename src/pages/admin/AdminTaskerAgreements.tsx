import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, FileSignature, Search, X, Copy, Download } from 'lucide-react';
import { exportToCsv } from '@/lib/exportCsv';
import { toast } from 'sonner';
import { hashAgreementText } from '@/lib/taskerAgreementText';

type Agreement = {
  id: string;
  user_id: string;
  agreement_type: string;
  agreement_version: string;
  locale: string;
  legal_name: string;
  phone: string | null;
  whatsapp_phone: string | null;
  country: string | null;
  city: string | null;
  tax_status: string | null;
  payout_method: string | null;
  service_categories: any;
  accepted_terms: boolean;
  accepted_notifications: boolean;
  accepted_whatsapp: boolean;
  signed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  snapshot_text: string;
  snapshot_text_hash: string;
  profile_email?: string | null;
  profile_display_name?: string | null;
};

export default function AdminTaskerAgreements() {
  const [rows, setRows] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [versionFilter, setVersionFilter] = useState('');
  const [selected, setSelected] = useState<Agreement | null>(null);
  const [hashValid, setHashValid] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase.from('tasker_agreements' as any) as any)
        .select('*')
        .order('signed_at', { ascending: false })
        .limit(1000);
      if (error) { toast.error(error.message); setLoading(false); return; }
      const userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
      let profilesById = new Map<string, any>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, email, display_name, first_name, last_name')
          .in('user_id', userIds);
        profilesById = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      }
      if (cancelled) return;
      setRows((data ?? []).map((r: any) => {
        const p = profilesById.get(r.user_id);
        return {
          ...r,
          profile_email: p?.email ?? null,
          profile_display_name: p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null,
        };
      }));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const versions = useMemo(() => Array.from(new Set(rows.map(r => r.agreement_version))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (versionFilter && r.agreement_version !== versionFilter) return false;
      if (!q) return true;
      return (
        (r.legal_name || '').toLowerCase().includes(q) ||
        (r.profile_email || '').toLowerCase().includes(q) ||
        (r.profile_display_name || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        r.user_id.includes(q)
      );
    });
  }, [rows, search, versionFilter]);

  const openCard = async (a: Agreement) => {
    setSelected(a);
    setHashValid(null);
    try {
      const computed = await hashAgreementText(a.snapshot_text);
      setHashValid(computed === a.snapshot_text_hash);
    } catch {
      setHashValid(null);
    }
  };

  const doExport = () => {
    exportToCsv('tasker-agreements.csv', filtered.map(r => ({
      id: r.id,
      user_id: r.user_id,
      email: r.profile_email,
      legal_name: r.legal_name,
      signed_at: r.signed_at,
      version: r.agreement_version,
      locale: r.locale,
      country: r.country,
      city: r.city,
      tax_status: r.tax_status,
      payout_method: r.payout_method,
      accepted_terms: r.accepted_terms,
      accepted_notifications: r.accepted_notifications,
      accepted_whatsapp: r.accepted_whatsapp,
      hash: r.snapshot_text_hash,
    })));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Tasker Agreements</h1>
          <span className="text-xs text-muted-foreground">({rows.length})</span>
        </div>
        <button
          onClick={doExport}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted"
        ><Download className="w-3.5 h-3.5" /> Export CSV</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, city, user id…"
            className="w-full ps-8 pe-3 py-2 rounded-lg border border-input bg-background text-sm"
          />
        </div>
        <select
          value={versionFilter}
          onChange={e => setVersionFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-input bg-background text-sm"
        >
          <option value="">All versions</option>
          {versions.map(v => <option key={v} value={v}>v{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-start px-3 py-2">Signed</th>
                <th className="text-start px-3 py-2">Legal name</th>
                <th className="text-start px-3 py-2">Email</th>
                <th className="text-start px-3 py-2">City</th>
                <th className="text-start px-3 py-2">Version</th>
                <th className="text-start px-3 py-2">Locale</th>
                <th className="text-start px-3 py-2">WA</th>
                <th className="text-start px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.signed_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.legal_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.profile_email || '—'}</td>
                  <td className="px-3 py-2">{r.city || '—'}</td>
                  <td className="px-3 py-2">v{r.agreement_version}</td>
                  <td className="px-3 py-2 uppercase text-xs">{r.locale}</td>
                  <td className="px-3 py-2">{r.accepted_whatsapp ? '✓' : '—'}</td>
                  <td className="px-3 py-2 text-end">
                    <button
                      onClick={() => openCard(r)}
                      className="px-2.5 py-1 rounded-md border border-border text-xs hover:bg-muted"
                    >View</button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No agreements found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-card rounded-2xl border border-border max-w-3xl w-full my-8 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold">Agreement — {selected.legal_name}</h2>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Info label="User ID" value={selected.user_id} />
                <Info label="Email" value={selected.profile_email || '—'} />
                <Info label="Signed at" value={new Date(selected.signed_at).toLocaleString()} />
                <Info label="Version" value={`v${selected.agreement_version}`} />
                <Info label="Locale" value={selected.locale} />
                <Info label="Country / City" value={`${selected.country || '—'} / ${selected.city || '—'}`} />
                <Info label="Phone" value={selected.phone || '—'} />
                <Info label="WhatsApp phone" value={selected.whatsapp_phone || '—'} />
                <Info label="Tax status" value={selected.tax_status || '—'} />
                <Info label="Payout method" value={selected.payout_method || '—'} />
                <Info label="Terms" value={selected.accepted_terms ? '✓' : '—'} />
                <Info label="Notifications" value={selected.accepted_notifications ? '✓' : '—'} />
                <Info label="WhatsApp opt-in" value={selected.accepted_whatsapp ? '✓' : '—'} />
                <Info label="IP" value={selected.ip_address || '—'} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">User agent</div>
                <div className="text-xs break-all">{selected.user_agent || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Categories</div>
                <div className="text-xs break-all">{JSON.stringify(selected.service_categories)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                  Hash
                  {hashValid === true && <span className="text-primary">✓ valid</span>}
                  {hashValid === false && <span className="text-destructive">✗ mismatch</span>}
                </div>
                <div className="text-[11px] break-all font-mono">{selected.snapshot_text_hash}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
                  <span>Snapshot text</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(selected.snapshot_text); toast.success('Copied'); }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] hover:bg-muted"
                  ><Copy className="w-3 h-3" /> Copy</button>
                </div>
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs bg-muted/40 p-3 rounded-lg border border-border">
{selected.snapshot_text}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground uppercase">{label}</div>
      <div className="text-sm break-all">{value}</div>
    </div>
  );
}