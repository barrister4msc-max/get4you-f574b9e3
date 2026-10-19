// Normalized order geography from OpenStreetMap (Nominatim, ODbL — attribution required).
// Stable internal IDs are explicit source mappings: "osm:R<relation>", "osm:N<node>", "osm:W<way>".
// Neighborhoods are only OSM suburb/neighbourhood/quarter places — never administrative
// districts (county / state_district / city_district / "נפה" / "מחוז"). Unknown stays null.

export type Lang = "en" | "ru" | "he" | "ar";

export type OrderGeo = {
  source: "osm";
  countryCode: string;               // ISO-3166 alpha-2, upper case
  cityId: string;                    // osm:R…
  cityNames: Partial<Record<Lang | "default", string>>;
  cityAliases: string[];
  neighborhoodId: string | null;
  neighborhoodName: string | null;
  address: string;                   // full private address — never sent to price research
  lat: number | null;
  lng: number | null;
  resolvedFor: string;               // address text this geo was resolved for
};

type NominatimPlace = {
  osm_type?: string; osm_id?: number; addresstype?: string; type?: string; category?: string;
  name?: string; display_name?: string; lat?: string; lon?: string;
  address?: Record<string, string>;
  namedetails?: Record<string, string> | null;
};

const CITY_TYPES = new Set(["city", "town", "village", "municipality", "hamlet"]);
const NEIGHBORHOOD_TYPES = new Set(["suburb", "neighbourhood", "quarter"]);

export const osmId = (type?: string, id?: number): string | null => {
  if (!type || !Number.isFinite(id)) return null;
  const t = type[0].toUpperCase();
  return ["R", "N", "W"].includes(t) ? `osm:${t}${id}` : null;
};

export function namesFrom(p: NominatimPlace): { names: OrderGeo["cityNames"]; aliases: string[] } {
  const nd = p.namedetails ?? {};
  const names: OrderGeo["cityNames"] = { default: nd.name ?? p.name };
  for (const l of ["en", "ru", "he", "ar"] as Lang[]) if (nd[`name:${l}`]) names[l] = nd[`name:${l}`];
  const aliases = new Set<string>();
  for (const [k, v] of Object.entries(nd)) {
    if (/^(name|alt_name|old_name|short_name|official_name)(:|$)/.test(k)) v.split(";").forEach((s) => s.trim() && aliases.add(s.trim()));
  }
  return { names, aliases: [...aliases] };
}

/** Accept a reverse result (zoom=10) only if it is a settlement. */
export function cityFromPlace(p: NominatimPlace | null) {
  if (!p) return null;
  const kind = p.addresstype ?? p.type ?? "";
  const id = osmId(p.osm_type, p.osm_id);
  if (!id || !CITY_TYPES.has(kind)) return null;
  const cc = p.address?.country_code?.toUpperCase();
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return null;
  return { id, countryCode: cc, ...namesFrom(p) };
}

/** Accept a reverse result (zoom=14..16) only if it is an urban neighborhood inside the same city. */
export function neighborhoodFromPlace(p: NominatimPlace | null, cityNames: string[]) {
  if (!p) return null;
  const kind = p.addresstype ?? p.type ?? "";
  const id = osmId(p.osm_type, p.osm_id);
  if (!id || !NEIGHBORHOOD_TYPES.has(kind)) return null;
  const a = p.address ?? {};
  const parentCity = a.city ?? a.town ?? a.village ?? a.municipality;
  if (parentCity && cityNames.length && !cityNames.includes(parentCity)) return null;
  return { id, name: p.name ?? p.namedetails?.name ?? a[kind] ?? null };
}

export const cityLabel = (g: Pick<OrderGeo, "cityNames">, lang: string) =>
  g.cityNames[lang as Lang] ?? g.cityNames.default ?? "";

/** True when a stored geo no longer describes the typed address (address edited → reset city & neighborhood). */
export const isGeoStale = (g: OrderGeo | null | undefined, address: string) => !g || g.resolvedFor !== address.trim();

// ---------------- network (Nominatim usage policy: ≤1 req/s, cache results) ----------------
const BASE = "https://nominatim.openstreetmap.org/reverse";
let lastCall = 0;
async function nominatim(lat: number, lng: number, zoom: number, lang: string, signal?: AbortSignal): Promise<NominatimPlace | null> {
  const key = `osm-rev:${zoom}:${lat.toFixed(4)},${lng.toFixed(4)}:${lang}`;
  try { const c = sessionStorage.getItem(key); if (c) return JSON.parse(c); } catch { /* ignore */ }
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = `${BASE}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1&namedetails=1&accept-language=${lang}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`osm_${res.status}`);
  const data = (await res.json()) as NominatimPlace & { error?: string };
  const out = data.error ? null : data;
  try { sessionStorage.setItem(key, JSON.stringify(out)); } catch { /* ignore */ }
  return out;
}

export type GeoResolveResult = { status: "resolved"; geo: OrderGeo } | { status: "no_city" } | { status: "error"; reason: string };

/** Resolve country/city/neighborhood for coordinates of the order address. */
export async function resolveOrderGeo(address: string, lat: number, lng: number, lang: string, signal?: AbortSignal): Promise<GeoResolveResult> {
  try {
    const city = cityFromPlace(await nominatim(lat, lng, 10, lang, signal));
    if (!city) return { status: "no_city" };
    const known = [...city.aliases, ...Object.values(city.names).filter(Boolean) as string[]];
    let nb: ReturnType<typeof neighborhoodFromPlace> = null;
    for (const z of [16, 14]) {
      nb = neighborhoodFromPlace(await nominatim(lat, lng, z, lang, signal), known);
      if (nb) break;
    }
    return { status: "resolved", geo: {
      source: "osm", countryCode: city.countryCode, cityId: city.id, cityNames: city.names, cityAliases: city.aliases,
      neighborhoodId: nb?.id ?? null, neighborhoodName: nb?.name ?? null,
      address: address.trim(), lat, lng, resolvedFor: address.trim(),
    } };
  } catch (e) {
    return { status: "error", reason: e instanceof Error ? e.message : "network" };
  }
}
