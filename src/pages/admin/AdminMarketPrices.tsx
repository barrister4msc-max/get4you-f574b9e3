import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';

const fresh = (iso: string, days: number) => Date.now() - Date.parse(iso) < days * 86400000;

export default function AdminMarketPrices() {
  const [city, setCity] = useState('');
  const obs = useQuery({
    queryKey: ['market-obs', city],
    queryFn: async () => {
      let q = supabase.from('market_price_observations').select('*').order('source_checked_at', { ascending: false }).limit(300);
      if (city) q = q.ilike('city', `%${city}%`);
      const { data, error } = await q; if (error) throw error; return data;
    },
  });
  const snaps = useQuery({
    queryKey: ['market-snaps', city],
    queryFn: async () => {
      let q = supabase.from('market_price_snapshots').select('*').order('calculated_at', { ascending: false }).limit(100);
      if (city) q = q.ilike('city', `%${city}%`);
      const { data, error } = await q; if (error) throw error; return data;
    },
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Market Price Intelligence</h1>
      <Input placeholder="Город (иврит)" value={city} onChange={(e) => setCity(e.target.value)} className="max-w-xs" />
      <section>
        <h2 className="font-semibold mb-2">Сводки ({snaps.data?.length ?? 0})</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th>Дата</th><th>Вид</th><th>Город</th><th>Параметры</th><th>Мин–макс</th><th>Медиана</th><th>Рек.</th><th>Источн.</th><th>Статус</th></tr></thead>
          <tbody>{snaps.data?.map((s) => (
            <tr key={s.id} className="border-t border-border"><td>{new Date(s.calculated_at).toLocaleString()}</td><td>{s.service_subtype}</td><td>{s.city} ({s.geography})</td>
              <td>{JSON.stringify(s.request_parameters)}</td><td>₪{s.market_min}–{s.market_max}</td><td>₪{s.market_median}</td><td>₪{s.recommended_price}</td><td>{s.number_of_sources}</td>
              <td>{Date.parse(s.fresh_until) > Date.now() ? 'актуально' : 'история'}</td></tr>))}</tbody>
        </table></div>
      </section>
      <section>
        <h2 className="font-semibold mb-2">Найденные цены ({obs.data?.length ?? 0})</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th>Проверено</th><th>Компания</th><th>Вид</th><th>Город</th><th>Цена</th><th>Единица</th><th>Цитата</th><th>Статус</th></tr></thead>
          <tbody>{obs.data?.map((o) => (
            <tr key={o.id} className="border-t border-border align-top"><td>{new Date(o.source_checked_at).toLocaleDateString()}</td>
              <td><a href={o.source_url} target="_blank" rel="noopener noreferrer nofollow" className="underline text-primary">{o.provider_domain}</a></td>
              <td>{o.service_subtype}</td><td>{o.city}</td><td>{o.price_value != null ? `₪${o.price_value}` : '—'}</td><td>{o.pricing_unit}</td>
              <td className="max-w-md break-words">{o.price_raw}</td>
              <td>{!o.is_active ? 'старая версия' : fresh(o.source_checked_at, 14) ? 'актуально' : 'история'}</td></tr>))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
