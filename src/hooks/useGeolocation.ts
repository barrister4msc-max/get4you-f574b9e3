import { useCallback, useEffect, useState } from "react";
import { geocodeChoiceStore } from "@/lib/geocodeChoice";

export type GeoSource = "gps" | "manual" | null;
export type GeoPermission = "unknown" | "granted" | "denied" | "unsupported" | "prompt";

type GeoState = {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
  source: GeoSource;
  label: string | null;
  permission: GeoPermission;
};

const STORAGE_KEY = "geo_manual_location_v1";

type StoredLocation = {
  latitude: number;
  longitude: number;
  label: string | null;
  source: GeoSource;
};

function loadStored(): StoredLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.latitude === "number" && typeof parsed?.longitude === "number") {
      return parsed as StoredLocation;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveStored(loc: StoredLocation | null) {
  try {
    if (loc) localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>(() => {
    const stored = loadStored();
    return {
      latitude: stored?.latitude ?? null,
      longitude: stored?.longitude ?? null,
      loading: false,
      error: null,
      source: stored?.source ?? null,
      label: stored?.label ?? null,
      permission: "unknown",
    };
  });

  // Probe permission once (non-blocking, best effort)
  useEffect(() => {
    if (!navigator.geolocation) {
      setState((p) => ({ ...p, permission: "unsupported" }));
      return;
    }
    const anyNav = navigator as Navigator & {
      permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> };
    };
    if (anyNav.permissions?.query) {
      anyNav.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          setState((p) => ({ ...p, permission: status.state as GeoPermission }));
          status.onchange = () => {
            setState((p) => ({ ...p, permission: status.state as GeoPermission }));
          };
        })
        .catch(() => {
          /* ignore */
        });
    }
  }, []);

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: "Geolocation not supported",
        permission: "unsupported",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: StoredLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: null,
          source: "gps",
        };
        saveStored(next);
        setState({
          ...next,
          loading: false,
          error: null,
          permission: "granted",
        });
      },
      (error) => {
        let message = "Failed to get location";
        let permission: GeoPermission = "unknown";

        if (error.code === error.PERMISSION_DENIED) {
          message = "Location permission denied";
          permission = "denied";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = "Location unavailable";
        } else if (error.code === error.TIMEOUT) {
          message = "Location timeout";
        }

        setState((prev) => ({
          ...prev,
          loading: false,
          error: message,
          permission: permission === "unknown" ? prev.permission : permission,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  /** Set a manually-chosen location (e.g. from a city dropdown or address search). */
  const setManualLocation = useCallback(
    (lat: number, lng: number, label?: string | null) => {
      const next: StoredLocation = {
        latitude: lat,
        longitude: lng,
        label: label ?? null,
        source: "manual",
      };
      saveStored(next);
      setState((prev) => ({
        ...prev,
        latitude: lat,
        longitude: lng,
        label: label ?? null,
        source: "manual",
        loading: false,
        error: null,
      }));
    },
    []
  );

  /** Geocode a free-text address using OpenStreetMap Nominatim (no API key). */
  const searchAddress = useCallback(
    async (query: string): Promise<{ lat: number; lng: number; label: string } | null> => {
      const q = query.trim();
      if (!q) return null;
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;
      const fetchOnce = async () => {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`Geocoding request failed (${res.status})`);
        return (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      };

      let data: Array<{ lat: string; lon: string; display_name: string }> | null = null;
      try {
        data = await fetchOnce();
      } catch {
        // One automatic retry with small backoff before surfacing an error.
        await new Promise((r) => setTimeout(r, 600));
        try {
          data = await fetchOnce();
        } catch (e) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: e instanceof Error ? e.message : "Geocoding failed",
          }));
          return null;
        }
      }

      if (!data?.length) {
        setState((prev) => ({ ...prev, loading: false, error: "Address not found" }));
        return null;
      }

      const candidates = data.slice(0, 5).map((d) => ({
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
        label: d.display_name,
      }));

      // Single match — apply directly.
      if (candidates.length === 1) {
        const c = candidates[0];
        setManualLocation(c.lat, c.lng, c.label);
        setState((prev) => ({ ...prev, loading: false, error: null }));
        return c;
      }

      // Multiple matches — ask the user to confirm before saving.
      setState((prev) => ({ ...prev, loading: false, error: null }));
      const picked = await geocodeChoiceStore.request(q, candidates);
      if (!picked) return null;
      setManualLocation(picked.lat, picked.lng, picked.label);
      return picked;
    },
    [setManualLocation]
  );

  /** Reverse-geocode lat/lng to a human-readable address using Nominatim. */
  const reverseGeocode = useCallback(
    async (lat: number, lng: number, lang?: string): Promise<string | null> => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=${lang || "en"}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return null;
        const data = (await res.json()) as { display_name?: string };
        return data?.display_name ?? null;
      } catch {
        return null;
      }
    },
    []
  );

  const clearLocation = useCallback(() => {
    saveStored(null);
    setState((prev) => ({
      ...prev,
      latitude: null,
      longitude: null,
      label: null,
      source: null,
      error: null,
    }));
  }, []);

  return {
    ...state,
    getCurrentLocation,
    setManualLocation,
    searchAddress,
    reverseGeocode,
    clearLocation,
  };
}
