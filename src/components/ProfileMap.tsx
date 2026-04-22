import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { LocationFallback } from '@/components/LocationFallback';
import { MapPin } from 'lucide-react';

// Leaflet's default marker icons break under bundlers; rebuild via CDN.
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const meIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:hsl(var(--primary));border:3px solid hsl(var(--background));box-shadow:0 0 0 2px hsl(var(--primary)/0.4);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

type TaskMarker = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  status: string | null;
  role: 'owner' | 'assignee';
};

export const ProfileMap = () => {
  const { user } = useAuth();
  const {
    latitude,
    longitude,
    error,
    permission,
    source,
    label,
    loading: geoLoading,
    searchAddress,
    setManualLocation,
    clearLocation,
  } = useGeolocation();
  const [tasks, setTasks] = useState<TaskMarker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('tasks')
        .select('id,title,latitude,longitude,status,user_id,assigned_to')
        .or(`user_id.eq.${user.id},assigned_to.eq.${user.id}`)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(200);
      if (cancelled) return;
      const mapped: TaskMarker[] = (data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        latitude: Number(t.latitude),
        longitude: Number(t.longitude),
        status: t.status,
        role: t.user_id === user.id ? 'owner' : 'assignee',
      }));
      setTasks(mapped);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const center = useMemo<[number, number]>(() => {
    if (latitude != null && longitude != null) return [latitude, longitude];
    if (tasks.length > 0) return [tasks[0].latitude, tasks[0].longitude];
    return [32.0853, 34.7818]; // Tel Aviv default
  }, [latitude, longitude, tasks]);

  const hasLocation = latitude != null && longitude != null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Карта местоположения</h2>
      </div>

      {!hasLocation && (
        <LocationFallback
          error={error}
          permission={permission}
          source={source}
          label={label}
          loading={geoLoading}
          onSearchAddress={searchAddress}
          onPickCity={(lat, lng, name) => setManualLocation(lat, lng, name)}
          onClear={clearLocation}
        />
      )}

      <div className="h-[360px] w-full overflow-hidden rounded-xl border border-border">
        <MapContainer
          center={center}
          zoom={hasLocation ? 12 : 9}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
          key={`${center[0]}-${center[1]}`}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {hasLocation && (
            <>
              <Marker position={[latitude!, longitude!]} icon={meIcon}>
                <Popup>
                  <strong>Вы здесь</strong>
                  {source === 'manual' && <div className="text-xs">Указано вручную{label ? `: ${label}` : ''}</div>}
                </Popup>
              </Marker>
              <Circle
                center={[latitude!, longitude!]}
                radius={3000}
                pathOptions={{ color: 'hsl(var(--primary))', fillOpacity: 0.08 }}
              />
            </>
          )}

          {tasks.map((t) => (
            <Marker key={t.id} position={[t.latitude, t.longitude]} icon={defaultIcon}>
              <Popup>
                <div className="space-y-1">
                  <strong>{t.title}</strong>
                  <div className="text-xs">
                    {t.role === 'owner' ? 'Моя задача (заказчик)' : 'Я исполнитель'}
                  </div>
                  {t.status && <div className="text-xs text-muted-foreground">Статус: {t.status}</div>}
                  <a
                    href={`/tasks/${t.id}`}
                    className="text-primary text-xs underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть задачу →
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        {loading
          ? 'Загрузка задач...'
          : `На карте показано ${tasks.length} задач, в которых вы заказчик или исполнитель.`}
      </p>
    </div>
  );
};