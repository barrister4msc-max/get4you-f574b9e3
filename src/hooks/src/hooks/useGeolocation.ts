import { useCallback, useState } from "react";

type GeoState = {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
};

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({
    latitude: null,
    longitude: null,
    loading: false,
    error: null,
  });

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: "Geolocation not supported",
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
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          loading: false,
          error: null,
        });
      },
      (error) => {
        let message = "Failed to get location";

        if (error.code === error.PERMISSION_DENIED) {
          message = "Location permission denied";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = "Location unavailable";
        } else if (error.code === error.TIMEOUT) {
          message = "Location timeout";
        }

        setState({
          latitude: null,
          longitude: null,
          loading: false,
          error: message,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  return {
    ...state,
    getCurrentLocation,
  };
}
