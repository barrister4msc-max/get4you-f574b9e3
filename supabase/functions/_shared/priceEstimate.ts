// Pure, deterministic price-estimate logic. No AI, no network, no invented numbers.
// Shared by the estimate-task-price edge function and the web client (runtime contract checks).

export type EstimateParams = {
  service: string;              // service key from serviceRegistry (e.g. "cleaning")
  subtype?: string | null;      // e.g. cleaning_type
  areaM2?: number | null;
  windows?: number | null;
  city?: string | null;
  currency: string;             // ISO code, major units
};

/** A confirmed tariff. Only real, documented tariffs may be registered in TARIFFS. */
export type Tariff = {
  id: string;
  version: string;
  service: string;
  subtype?: string | null;      // null = applies to every subtype
  currency: string;
  base: number;
  pricePerM2?: number;
  pricePerWindow?: number;
  minimum?: number;
  maxAreaM2?: number;           // tariff is not valid above this area
};

/** No confirmed tariffs exist yet. Synthetic tariffs belong in test fixtures only. */
export const TARIFFS: Tariff[] = [];

export type ComparableRecord = {
  amount: number;               // final released amount, major units
  currency: string;
  areaM2?: number | null;
  subtype?: string | null;
};

export type Component = { label: string; unit: string; quantity: number; unitPrice: number; amount: number };

export type EstimateResult =
  | { status: "available"; method: "tariff"; currency: string; total: number;
      provenance: { tariffId: string; tariffVersion: string; components: Component[]; minimumApplied: boolean } }
  | { status: "available"; method: "history"; currency: string; min: number; max: number; recommended: number;
      provenance: { sampleSize: number; statistic: "p25-median-p75"; areaWindowPct: number | null } }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTariff(t: Tariff, p: EstimateParams): EstimateResult {
  if (t.currency !== p.currency) return { status: "unavailable", reason: "currency_mismatch" };
  if (t.subtype && t.subtype !== (p.subtype ?? null)) return { status: "unavailable", reason: "subtype_mismatch" };
  const components: Component[] = [{ label: "base", unit: "order", quantity: 1, unitPrice: t.base, amount: t.base }];
  if (t.pricePerM2 !== undefined) {
    if (!finite(p.areaM2) || p.areaM2 <= 0 || p.areaM2 > 10000) return { status: "unavailable", reason: "area_required" };
    if (t.maxAreaM2 !== undefined && p.areaM2 > t.maxAreaM2) return { status: "unavailable", reason: "area_outside_tariff" };
    components.push({ label: "area", unit: "m2", quantity: p.areaM2, unitPrice: t.pricePerM2, amount: p.areaM2 * t.pricePerM2 });
  }
  if (t.pricePerWindow !== undefined && finite(p.windows) && p.windows > 0) {
    if (p.windows > 500) return { status: "unavailable", reason: "windows_out_of_range" };
    components.push({ label: "windows", unit: "window", quantity: p.windows, unitPrice: t.pricePerWindow, amount: p.windows * t.pricePerWindow });
  }
  const sum = components.reduce((s, c) => s + c.amount, 0);
  const minimumApplied = t.minimum !== undefined && sum < t.minimum;
  const total = round2(minimumApplied ? t.minimum! : sum);
  if (!finite(total) || total <= 0) return { status: "error", reason: "invalid_total" };
  return { status: "available", method: "tariff", currency: t.currency, total,
    provenance: { tariffId: t.id, tariffVersion: t.version, components, minimumApplied } };
}

export function findTariff(p: EstimateParams, tariffs: Tariff[] = TARIFFS): Tariff | null {
  return tariffs.find((t) => t.service === p.service && t.currency === p.currency && (!t.subtype || t.subtype === p.subtype)) ?? null;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const b = Math.floor(pos);
  return sorted[b + 1] !== undefined ? sorted[b] + (pos - b) * (sorted[b + 1] - sorted[b]) : sorted[b];
}

export const MIN_COMPARABLES = 5;
export const AREA_WINDOW_PCT = 15; // comparability filter on job size, not a price margin

/** Estimate from completed orders. Records without the needed volume are not comparable. */
export function computeHistory(records: ComparableRecord[], p: EstimateParams, needsArea: boolean): EstimateResult {
  const usable = records.filter((r) => {
    if (!finite(r.amount) || r.amount <= 0 || r.currency !== p.currency) return false;
    if (p.subtype && r.subtype !== p.subtype) return false;
    if (needsArea) {
      if (!finite(p.areaM2) || !finite(r.areaM2)) return false;
      return Math.abs(r.areaM2 - p.areaM2) <= (p.areaM2 * AREA_WINDOW_PCT) / 100;
    }
    return true;
  });
  if (usable.length < MIN_COMPARABLES) return { status: "unavailable", reason: "not_enough_comparable_orders" };
  const s = usable.map((r) => r.amount).sort((a, b) => a - b);
  return { status: "available", method: "history", currency: p.currency,
    min: Math.round(quantile(s, 0.25)), recommended: Math.round(quantile(s, 0.5)), max: Math.round(quantile(s, 0.75)),
    provenance: { sampleSize: usable.length, statistic: "p25-median-p75", areaWindowPct: needsArea ? AREA_WINDOW_PCT : null } };
}

/** Runtime validation of the wire contract. Anything malformed becomes "error"; no money leaks on unavailable/error. */
export function parseEstimateResponse(x: unknown): EstimateResult {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return { status: "error", reason: "malformed" };
  if (o.status === "unavailable") return { status: "unavailable", reason: String(o.reason ?? "") };
  if (o.status === "error") return { status: "error", reason: String(o.reason ?? "") };
  if (o.status !== "available" || typeof o.currency !== "string" || !o.provenance) return { status: "error", reason: "malformed" };
  if (o.method === "tariff" && finite(o.total) && o.total > 0) return o as unknown as EstimateResult;
  if (o.method === "history" && finite(o.min) && finite(o.max) && finite(o.recommended) &&
      o.min > 0 && o.min <= o.recommended && o.recommended <= o.max) return o as unknown as EstimateResult;
  return { status: "error", reason: "malformed" };
}

/** Request identity: any change here makes previous estimates stale. */
export function estimateKey(p: EstimateParams): string {
  return JSON.stringify([p.service, p.subtype ?? null, p.areaM2 ?? null, p.windows ?? null, (p.city ?? "").trim().toLowerCase(), p.currency]);
}
