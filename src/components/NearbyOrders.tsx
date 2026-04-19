import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { Link } from 'react-router-dom';
import { MapPin, Loader2 } from 'lucide-react';

interface NearbyOrder {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  price: number | null;
  created_at: string;
  distance: number;
}

export const NearbyOrders = ({ radiusKm = 10 }: { radiusKm?: number }) => {
  const { t, currency } = useLanguage();
  const formatPrice = useFormatPrice();
  const [orders, setOrders] = useState<NearbyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError(t('nearby.noGeo') || 'Геолокация недоступна');
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { data, error } = await supabase.rpc('get_orders_nearby', {
          user_lat: pos.coords.latitude,
          user_lng: pos.coords.longitude,
          radius_km: radiusKm,
        });
        if (error) setError(error.message);
        else setOrders(((data as NearbyOrder[]) || []).filter(o => o.distance <= radiusKm).slice(0, 10));
        setLoading(false);
      },
      () => {
        setError(t('nearby.denied') || 'Разрешите доступ к геолокации');
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, [radiusKm, t]);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          {t('nearby.title') || 'Заказы рядом со мной'}
        </h2>
        <span className="text-xs text-muted-foreground">{radiusKm} km</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground py-3">{error}</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          {t('nearby.empty') || 'Поблизости пока нет заказов'}
        </p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link
              key={o.id}
              to={o.status === 'open' ? `/tasks` : '#'}
              className="block p-3 rounded-xl border border-border bg-card hover:shadow-card-hover transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">
                    {o.title || t('nearby.untitled') || 'Без названия'}
                  </h3>
                  {o.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{o.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-primary font-medium">
                      {o.distance.toFixed(1)} km
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {o.price != null && (
                  <div className="text-primary font-bold text-sm shrink-0">
                    {formatPrice(Number(o.price), currency, 'ILS')}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
