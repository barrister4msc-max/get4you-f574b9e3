import { useState } from "react";
import { MapPin, Search, X, AlertTriangle, Loader2 } from "lucide-react";
import type { GeoPermission, GeoSource } from "@/hooks/useGeolocation";

interface CityPreset {
  name: string;
  lat: number;
  lng: number;
}

const DEFAULT_CITIES: CityPreset[] = [
  { name: "Tel Aviv", lat: 32.0853, lng: 34.7818 },
  { name: "Jerusalem", lat: 31.7683, lng: 35.2137 },
  { name: "Haifa", lat: 32.794, lng: 34.9896 },
  { name: "Beer Sheva", lat: 31.2518, lng: 34.7913 },
  { name: "Eilat", lat: 29.5577, lng: 34.9519 },
  { name: "Netanya", lat: 32.3215, lng: 34.853 },
];

interface Props {
  error: string | null;
  permission: GeoPermission;
  source: GeoSource;
  label: string | null;
  loading: boolean;
  onSearchAddress: (query: string) => Promise<{ lat: number; lng: number; label: string } | null>;
  onPickCity: (lat: number, lng: number, name: string) => void;
  onClear: () => void;
  cities?: CityPreset[];
  className?: string;
}

/**
 * Fallback UI shown when the browser denies/blocks geolocation.
 * Lets users pick a city preset or type any address (Nominatim geocoding).
 */
export function LocationFallback({
  error,
  permission,
  source,
  label,
  loading,
  onSearchAddress,
  onPickCity,
  onClear,
  cities = DEFAULT_CITIES,
  className = "",
}: Props) {
  const [query, setQuery] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    await onSearchAddress(query);
  };

  const isDenied = permission === "denied" || permission === "unsupported" || !!error;

  if (!isDenied && source !== "manual") return null;

  return (
    <div
      className={`mt-3 rounded-xl border border-border bg-secondary/40 p-3 text-start ${className}`}
    >
      {source === "manual" && label ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span className="truncate">{label}</span>
          </span>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear location"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium">
              {permission === "unsupported"
                ? "Geolocation is not supported by this browser."
                : permission === "denied"
                  ? "Location access is blocked. Choose a city or enter an address instead."
                  : error || "Couldn't read your location. Pick a city or enter an address."}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="City or address"
            className="w-full ps-9 pe-3 py-2 rounded-lg border border-input bg-card text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
          Set
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {cities.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => onPickCity(c.lat, c.lng, c.name)}
            className="text-[11px] px-2 py-1 rounded-full border border-border bg-card hover:bg-secondary transition-colors"
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default LocationFallback;