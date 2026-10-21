// Persistent market price intelligence: every verified internet quote becomes an observation
// (deduplicated, versioned on price change); every estimate becomes a reusable snapshot.
import type { RawOffer, WebEstimate } from "./webPrices.ts";

export const SNAPSHOT_FRESH_MS = 7 * 86400000;
export const OBSERVATION_FRESH_MS = 14 * 86400000;

export function snapshotKey(p: { service: string; subtype: string | null; city: string; areaM2: number | null; windows: number | null }): string {
  return JSON.stringify(["v1", p.service, p.subtype, p.city, p.areaM2, p.windows]);
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function observationFrom(o: RawOffer, ctx: { service: string; subtype: string; city: string; title?: string }) {
  const unit = o.unit === "per_job" ? (o.isFromPrice ? "starting_from" : "fixed") : o.unit === "per_room_job" ? "per_room" : o.unit === "other" ? "quote_only" : o.unit;
  const finite = Number.isFinite(o.price) && o.price > 0;
  let domain = ""; try { domain = new URL(o.url).hostname.replace(/^www\./, ""); } catch { /* skip */ }
  return {
    service_type: ctx.service, service_subtype: ctx.subtype, country: "IL", city: ctx.city,
    provider_name: domain, provider_domain: domain, source_url: o.url, source_title: ctx.title ?? null, source_language: /[\u0590-\u05ff]/.test(o.quote) ? "he" : /[а-я]/i.test(o.quote) ? "ru" : "en",
    price_raw: o.quote, price_value: finite ? o.price : null, currency: "ILS", pricing_unit: unit,
    minimum_price: o.isFromPrice && finite ? o.price : null,
    price_per_m2: o.unit === "per_m2" && finite ? o.price : null, price_per_hour: o.unit === "per_hour" && finite ? o.price : null,
    price_per_window: o.unit === "per_window" && finite ? o.price : null,
    area_min: o.areaMin, area_max: o.areaMax,
    extras: { price_max: o.priceMax, includes_windows: o.includesWindows, vat_note: o.vatNote },
  };
}

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
export async function saveObservations(db: any, groups: Array<{ url: string; offers: RawOffer[] }>, ctx: { service: string; subtype: string; city: string }, titles: Map<string, string>) {
  const now = new Date().toISOString(); let inserted = 0, refreshed = 0;
  for (const g of groups) for (const o of g.offers) {
    const row = observationFrom(o, { ...ctx, title: titles.get(g.url) });
    const hash = await sha(JSON.stringify([row.source_url, ctx.subtype, ctx.city, row.pricing_unit, row.price_value, o.priceMax, row.price_raw]));
    const { data: same } = await db.from("market_price_observations").select("id").eq("content_hash", hash).eq("is_active", true).limit(1);
    if (same?.length) { await db.from("market_price_observations").update({ source_checked_at: now }).eq("id", same[0].id); refreshed++; continue; }
    // Same source + unit with a different price: keep the old version as history, mark it inactive.
    await db.from("market_price_observations").update({ is_active: false }).eq("source_url", row.source_url).eq("service_subtype", ctx.subtype)
      .eq("city", ctx.city).eq("pricing_unit", row.pricing_unit).eq("is_active", true);
    const { error } = await db.from("market_price_observations").insert({ ...row, content_hash: hash, source_checked_at: now });
    if (!error) inserted++;
  }
  return { inserted, refreshed };
}

// deno-lint-ignore no-explicit-any
export async function readSnapshot(db: any, key: string): Promise<WebEstimate | null> {
  const { data } = await db.from("market_price_snapshots").select("result,fresh_until,calculated_at").eq("request_key", key)
    .order("calculated_at", { ascending: false }).limit(1);
  const s = data?.[0];
  if (!s || Date.parse(s.fresh_until) <= Date.now()) return null;
  return s.result as WebEstimate;
}

// deno-lint-ignore no-explicit-any
export async function saveSnapshot(db: any, key: string, params: Record<string, unknown>, city: string, subtype: string, est: Extract<WebEstimate, { status: "available" }>) {
  const values = est.provenance.offers.map((o) => o.normalized);
  const urls = [...new Set(est.provenance.offers.map((o) => o.url))];
  const { data: obs } = await db.from("market_price_observations").select("id").in("source_url", urls).eq("service_subtype", subtype).eq("is_active", true);
  const result = { ...est, provenance: { ...est.provenance, cacheHit: false } };
  await db.from("market_price_snapshots").insert({
    service_type: "cleaning", service_subtype: subtype, city, geography: est.provenance.geography, request_key: key, request_parameters: params,
    market_min: est.min, market_max: est.max, market_median: median(values), market_average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    recommended_price: est.recommended, currency: "ILS", number_of_sources: urls.length, number_of_price_observations: values.length,
    confidence: Math.min(1, urls.length / 5), source_observation_ids: (obs ?? []).map((r: { id: string }) => r.id), result,
    fresh_until: new Date(Date.now() + SNAPSHOT_FRESH_MS).toISOString(),
  });
}
