// Internet price research for cleaning: Firecrawl search (Hebrew, Israel) →
// page text → AI extracts candidate offers with verbatim quotes → each quote is
// verified against the page text → pure normalisation/aggregation.
// Only the service, cleaning type and city/region name are sent out — never an
// address, name, phone or any other personal data.
import {
  aggregate, CLEANING_QUERY_HE, isVerified, normalizeCleaning, regionFor,
  type AppliedOffer, type CleaningType, type OrderSpec, type RawOffer, type WebEstimate,
} from "../_shared/webPrices.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const AI_URL = "https://ai.gateway.lovable.dev/v1/responses";
const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: WebEstimate }>();

type Page = { url: string; text: string };

async function search(query: string): Promise<Page[]> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!lovableKey || !fcKey) throw new Error("search_not_configured");
  const res = await fetch(`${GATEWAY}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": fcKey },
    body: JSON.stringify({ query, limit: 8, country: "IL", lang: "he", tbs: "qdr:y",
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`search_failed_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const items: Array<{ url?: string; markdown?: string }> = j?.data?.web ?? j?.data ?? [];
  return items.filter((i) => i.url && i.markdown).map((i) => ({ url: i.url!, text: i.markdown!.slice(0, 14000) }));
}

const N = (t: string) => ({ type: [t, "null"] });
const OFFER_SCHEMA = {
  type: "object", additionalProperties: false, required: ["offers"],
  properties: { offers: { type: "array", items: {
    type: "object", additionalProperties: false,
    required: ["quote", "price", "price_max", "unit", "cleaning_type", "area_min", "area_max", "is_from_price", "includes_windows", "vat_note"],
    properties: {
      quote: { type: "string" }, price: { type: "number" }, price_max: N("number"),
      unit: { type: "string", enum: ["per_job", "per_m2", "per_hour", "per_window", "per_room_job", "other"] },
      cleaning_type: { type: "string", enum: ["regular", "deep", "after_renovation", "move_in_out", "unknown"] },
      area_min: N("number"), area_max: N("number"), is_from_price: { type: "boolean" },
      includes_windows: N("boolean"), vat_note: N("string"),
    } } } },
};

const SYSTEM =
  "Extract residential cleaning price offers in ILS from the page. Copy `quote` verbatim from the page (it must contain the number). " +
  "Use unit per_m2 only when the price is explicitly per square metre; per_job with area_min/area_max only when the page states the m\u00b2 range; " +
  "per_room_job when priced by number of rooms; per_hour for hourly; per_window for a price per window. If the price is a range A-B, set price=A and price_max=B, else price_max=null. Whenever the page states an m\\u00b2 range for the price (even if priced by rooms), fill area_min/area_max. Mark 'from/\u05d4\u05d7\u05dc \u05de/\u05de-' prices as is_from_price. " +
  "cleaning_type: regular=ongoing, deep=thorough/general, after_renovation=after renovation, move_in_out=before move-in/after move-out. Never invent numbers; return an empty list if none.";

/** Streams a Responses call and returns the concatenated output text. */
async function extract(page: Page): Promise<RawOffer[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return [];
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: "openai/gpt-6-astra", stream: true, store: false,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `URL: ${page.url}\n\n${page.text}` },
      ],
      text: { format: { type: "json_schema", name: "offers", strict: true, schema: OFFER_SCHEMA } },
    }),
  });
  if (!res.ok || !res.body) { console.warn("[prices] extract failed", res.status); return []; }
  let out = ""; let buf = "";
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const ev = JSON.parse(line.slice(5));
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
      } catch { /* keep-alive */ }
    }
  }
  let parsed: { offers?: Array<Record<string, unknown>> } = {};
  try { parsed = JSON.parse(out || "{}"); } catch { return []; }
  return (parsed.offers ?? []).map((o) => ({
    url: page.url, quote: String(o.quote ?? ""), price: Number(o.price), priceMax: typeof o.price_max === "number" ? o.price_max : null,
    unit: (o.unit as RawOffer["unit"]) ?? "other",
    cleaningType: o.cleaning_type === "unknown" ? null : (o.cleaning_type as CleaningType),
    areaMin: typeof o.area_min === "number" ? o.area_min : null,
    areaMax: typeof o.area_max === "number" ? o.area_max : null,
    isFromPrice: o.is_from_price === true,
    includesWindows: typeof o.includes_windows === "boolean" ? o.includes_windows : null,
    vatNote: typeof o.vat_note === "string" ? o.vat_note : null,
  }));
}

async function offersFor(place: string, spec: OrderSpec): Promise<AppliedOffer[]> {
  let pages: Page[] = [];
  try {
    const [a, b] = await Promise.all([
      search(`${CLEANING_QUERY_HE[spec.cleaningType]} ${place}`),
      search(`מחירון ניקיון ${place}`),
    ]);
    const seen = new Set<string>();
    pages = [...a, ...b].filter((p) => !seen.has(p.url) && seen.add(p.url));
  }
  catch (e) { console.warn("[prices] search failed", e instanceof Error ? e.message : String(e)); return []; }
  // A page counts for this geography only if it mentions the place itself.
  const relevant = pages.filter((p) => p.text.includes(place.split(" ")[0]));
  const extracted = await Promise.all(relevant.map(async (p) => ({ p, offers: await extract(p).catch(() => []) })));
  const applied: AppliedOffer[] = [];
  for (const { p, offers } of extracted) {
    const verified = offers.filter((o) => isVerified(o, p.text));
    const windowPrices = verified.filter((o) => o.unit === "per_window" && !o.isFromPrice).map((o) => o.price);
    const windowPrice = windowPrices.length === 1 ? windowPrices[0] : null; // ambiguous → none
    for (const o of verified) {
      applied.push(...normalizeCleaning(o, spec, windowPrice));
    }
  }
  console.info("[prices]", JSON.stringify({ place, pages: pages.length, relevant: relevant.length,
    extracted: extracted.reduce((n, x) => n + x.offers.length, 0),
    verified: extracted.reduce((n, x) => n + x.offers.filter((o) => isVerified(o, x.p.text)).length, 0), applied: applied.length }));
  if (Deno.env.get("PRICES_DEBUG")) console.info(JSON.stringify(extracted.map((x) => x.offers.map((o) => [o.unit, o.cleaningType, o.price, o.areaMin, o.areaMax, isVerified(o, x.p.text), o.quote.slice(0, 80)]))));
  return applied;
}

export async function researchCleaning(cityHe: string, spec: OrderSpec): Promise<WebEstimate> {
  const key = JSON.stringify([cityHe, spec]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const checkedAt = new Date().toISOString();
  let result = aggregate(await offersFor(cityHe, spec), "city", cityHe, checkedAt);
  if (result.status !== "available") {
    const region = regionFor(cityHe);
    if (region) result = aggregate(await offersFor(region, spec), "region", region, checkedAt);
  }
  cache.set(key, { at: Date.now(), value: result });
  return result;
}
