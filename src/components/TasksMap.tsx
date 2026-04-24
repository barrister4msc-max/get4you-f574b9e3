import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { MapPin } from 'lucide-react';

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

const ClusteredMarkers = ({ tasks }: { tasks: TasksMapTask[] }) => {
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
        m.bindPopup(
          `<div style="min-width:140px"><strong>${t.title.replace(/</g, '&lt;')}</strong>` +
            `<div><a href="/tasks/${t.id}" style="color:hsl(var(--primary));font-size:11px;text-decoration:underline">Открыть →</a></div></div>`
        );
        return m;
      });
    group.addLayers(markers);
  }, [tasks]);

  return null;
};

type TasksMapProps = {
  tasks: TasksMapTask[];
  userLat?: number | null;
  userLng?: number | null;
  title?: string;
};

export const TasksMap = ({ tasks, userLat, userLng, title = 'Карта задач' }: TasksMapProps) => {
  const hasUser = userLat != null && userLng != null;
  const validTasks = tasks.filter((t) => t.latitude != null && t.longitude != null);

  const center = useMemo<[number, number]>(() => {
    if (hasUser) return [userLat as number, userLng as number];
    if (validTasks.length > 0) return [validTasks[0].latitude as number, validTasks[0].longitude as number];
    return [32.0853, 34.7818];
  }, [hasUser, userLat, userLng, validTasks]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          ({validTasks.length})
        </span>
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
          {hasUser && (
            <>
              <Marker position={[userLat as number, userLng as number]} icon={meIcon}>
                <Popup>
                  <strong>Вы здесь</strong>
                </Popup>
              </Marker>
              <Circle
                center={[userLat as number, userLng as number]}
                radius={3000}
                pathOptions={{ color: 'hsl(var(--primary))', fillOpacity: 0.08 }}
              />
            </>
          )}
          <ClusteredMarkers tasks={validTasks} />
        </MapContainer>
      </div>
    </div>
  );
};