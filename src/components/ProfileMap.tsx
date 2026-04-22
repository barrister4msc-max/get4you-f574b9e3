import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { LocationFallback } from '@/components/LocationFallback';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const meIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:hsl(var(--primary));border:3px solid hsl(var(--background));box-shadow:0 0 0 2px hsl(var(--primary)/0.4);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const makeDot = (color: string) =>
  L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

const ownerIcon = makeDot('hsl(142 71% 45%)');
const assigneeIcon = makeDot('hsl(38 92% 50%)');
const otherIcon = makeDot('hsl(217 91% 60%)');

type TaskMarker = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  status: string | null;
  role: 'owner' | 'assignee' | 'other';
};

/** Recenter helper — flies the map when target changes. */
const Recenter = ({ target }: { target: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 14, { duration: 0.8 });
  }, [target, map]);
  return null;
};

/** Render markers in a leaflet.markercluster group for performance + de-overlap. */
const ClusteredMarkers = ({ tasks }: { tasks: TaskMarker[] }) => {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const group = (L as any).markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
    }) as L.MarkerClusterGroup;
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers = tasks.map((t) => {
      const icon = t.role === 'owner' ? ownerIcon : t.role === 'assignee' ? assigneeIcon : otherIcon;
      const m = L.marker([t.latitude, t.longitude], { icon });
      const roleText =
        t.role === 'owner' ? 'Моя задача (заказчик)' : t.role === 'assignee' ? 'Я исполнитель' : 'Задача на платформе';
      const statusText = t.status ? `<div style="font-size:11px;opacity:0.7">Статус: ${t.status}</div>` : '';
      m.bindPopup(
        `<div style="min-width:160px"><strong>${t.title.replace(/</g, '&lt;')}</strong>` +
          `<div style="font-size:11px">${roleText}</div>${statusText}` +
          `<a href="/tasks/${t.id}" target="_blank" rel="noreferrer" style="color:hsl(var(--primary));font-size:11px;text-decoration:underline">Открыть задачу →</a></div>`
      );
      return m;
    });
    group.addLayers(markers);
  }, [tasks]);

  return null;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTarget, setSearchTarget] = useState<[number, number] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('tasks_public')
        .select('id,title,latitude,longitude,status,user_id,assigned_to')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(500);
      if (cancelled) return;
      const mapped: TaskMarker[] = (data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        latitude: Number(t.latitude),
        longitude: Number(t.longitude),
        status: t.status,
        role:
          t.user_id === user.id ? 'owner' : t.assigned_to === user.id ? 'assignee' : 'other',
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
    return [32.0853, 34.7818];
  }, [latitude, longitude, tasks]);

  const hasLocation = latitude != null && longitude != null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (!data?.length) {
        toast.error('Адрес не найден');
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      setSearchTarget([lat, lng]);
      toast.success(`Карта центрирована: ${data[0].display_name}`);
    } catch {
      toast.error('Ошибка поиска адреса');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Карта задач</h2>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Найти адрес или город на карте..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={searching || !searchQuery.trim()} size="default">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span className="ml-2 hidden sm:inline">Найти</span>
        </Button>
      </form>

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

      <div className="h-[420px] w-full overflow-hidden rounded-xl border border-border">
        <MapContainer
          center={center}
          zoom={hasLocation ? 12 : 9}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Recenter target={searchTarget} />

          {hasLocation && (
            <>
              <Marker position={[latitude!, longitude!]} icon={meIcon}>
                <Popup>
                  <strong>Вы здесь</strong>
                  {source === 'manual' && (
                    <div className="text-xs">Указано вручную{label ? `: ${label}` : ''}</div>
                  )}
                </Popup>
              </Marker>
              <Circle
                center={[latitude!, longitude!]}
                radius={3000}
                pathOptions={{ color: 'hsl(var(--primary))', fillOpacity: 0.08 }}
              />
            </>
          )}

          <ClusteredMarkers tasks={tasks} />
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(142 71% 45%)' }} />
          Мои задачи
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(38 92% 50%)' }} />
          Я исполнитель
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(217 91% 60%)' }} />
          Другие задачи
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {loading ? 'Загрузка задач...' : `На карте показано ${tasks.length} задач (с кластеризацией).`}
      </p>
    </div>
  );
};
