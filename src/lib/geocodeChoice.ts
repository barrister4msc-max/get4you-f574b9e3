import { useSyncExternalStore } from "react";

export type GeocodeCandidate = {
  lat: number;
  lng: number;
  label: string;
};

type State = {
  open: boolean;
  candidates: GeocodeCandidate[];
  query: string;
  resolver: ((value: GeocodeCandidate | null) => void) | null;
};

let state: State = { open: false, candidates: [], query: "", resolver: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const geocodeChoiceStore = {
  getSnapshot: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  request(query: string, candidates: GeocodeCandidate[]): Promise<GeocodeCandidate | null> {
    // Cancel any previous pending choice.
    if (state.resolver) {
      try {
        state.resolver(null);
      } catch {
        /* ignore */
      }
    }
    return new Promise((resolve) => {
      state = { open: true, candidates, query, resolver: resolve };
      emit();
    });
  },
  pick(idx: number) {
    const c = state.candidates[idx];
    const r = state.resolver;
    state = { open: false, candidates: [], query: "", resolver: null };
    emit();
    r?.(c ?? null);
  },
  cancel() {
    const r = state.resolver;
    state = { open: false, candidates: [], query: "", resolver: null };
    emit();
    r?.(null);
  },
};

export function useGeocodeChoice() {
  return useSyncExternalStore(geocodeChoiceStore.subscribe, geocodeChoiceStore.getSnapshot, geocodeChoiceStore.getSnapshot);
}