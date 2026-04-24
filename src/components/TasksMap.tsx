import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { MapPin, Navigation, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';

const meIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:hsl(var(--primary));border:3px solid hsl(var(--background));box-shadow:0 0 0 2px hsl(var(--primary)/0.4);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const taskIcon = L.divIcon({
  className: '',
  html: `<div style="width:12px;height:12px;border-radius:9999px;background:hsl(217 91% 60%);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export type TasksMapTask = {
  id: string;
  title: string;
  latitude: number | null;
  longitude: number | null;
};

const Recenter = ({ target, zoom }: { target: [number, number] | null; zoom: number }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, zoom, { duration: 0.8 });
  }, [target, zoom, map]);
  return null;
};

const ClusteredMarkers = ({ tasks, dir, openLabel }: { tasks: TasksMapTask[]; dir: 'ltr' | 'rtl'; openLabel: string }) => {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const group = (L as any).markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 45,
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
    const markers = tasks
      .filter((t) => t.latitude != null && t.longitude != null)
      .map((t) => {
        const m = L.marker([t.latitude as number, t.longitude as number], { icon: taskIcon });
        const safeTitle = t.title.replace(/</g, '&lt;');
        const arrow = dir === 'rtl' ? '←' : '→';
        m.bindPopup(
          `<div dir="${dir}" style="min-width:140px;text-align:${dir === 'rtl' ? 'right' : 'left'}">` +
            `<strong>${safeTitle}</strong>` +
            `<div><a href="/tasks/${t.id}" style="color:hsl(var(--primary));font-size:11px;text-decoration:underline">${openLabel} ${arrow}</a></div>` +
            `</div>`
        );
        return m;
      });
    group.addLayers(markers);
  }, [tasks, dir, openLabel]);

  return null;
};

type TasksMapProps = {
  tasks: TasksMapTask[];
  userLat?: number | null;
  userLng?: number | null;
  title?: string;
  onRequestLocation?: () => void;
  geoLoading?: boolean;
  radiusKm?: number | null;
};

export const TasksMap = ({ tasks, userLat, userLng, title, onRequestLocation, geoLoading, radiusKm }: TasksMapProps) => {
  const { t, dir } = useLanguage();
  const heading = title ?? t('tasks.map.title');
  const youHereLabel = t('tasks.map.youHere');
  const openLabel = t('tasks.map.open');
  const allowLabel = t('tasks.map.allowLocation');
  const hasUser = userLat != null && userLng != null;
  const validTasks = tasks.filter((t) => t.latitude != null && t.longitude != null);

  const center = useMemo<[number, number]>(() => {
    if (hasUser) return [userLat as number, userLng as number];
    if (validTasks.length > 0) return [validTasks[0].latitude as number, validTasks[0].longitude as number];
    return [32.0853, 34.7818];
  }, [hasUser, userLat, userLng, validTasks]);

  const flyTarget = useMemo<[number, number] | null>(
    () => (hasUser ? [userLat as number, userLng as number] : null),
    [hasUser, userLat, userLng],
  );

  const circleRadius = (radiusKm && radiusKm > 0 ? radiusKm : 3) * 1000;

  return (
    <div className="space-y-2" dir={dir}>
      <div className="flex items-center gap-2 flex-wrap">
        <MapPin className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">{heading}</h2>
        <span className="text-xs text-muted-foreground">({validTasks.length})</span>
        {!hasUser && onRequestLocation && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRequestLocation}
            disabled={geoLoading}
            className="ms-auto h-8"
          >
            {geoLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Navigation className="w-3.5 h-3.5" />
            )}
            <span className="ms-2">{allowLabel}</span>
          </Button>
        )}
      </div>
      <div className="h-[220px] w-full overflow-hidden rounded-xl border border-border">
        <MapContainer
          center={center}
          zoom={hasUser ? 12 : 9}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recenter target={flyTarget} zoom={13} />
          {hasUser && (
            <>
              <Marker position={[userLat as number, userLng as number]} icon={meIcon}>
                <Popup>
                  <div dir={dir} style={{ textAlign: dir === 'rtl' ? 'right' : 'left' }}>
                    <strong>{youHereLabel}</strong>
                  </div>
                </Popup>
              </Marker>
              <Circle
                center={[userLat as number, userLng as number]}
                radius={circleRadius}
                pathOptions={{ color: 'hsl(var(--primary))', fillOpacity: 0.08 }}
              />
            </>
          )}
          <ClusteredMarkers tasks={validTasks} dir={dir} openLabel={openLabel} />
        </MapContainer>
      </div>
    </div>
  );
};