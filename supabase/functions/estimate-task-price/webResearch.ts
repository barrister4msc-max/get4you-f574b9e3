// Internet price research for cleaning: Firecrawl search (Hebrew, Israel) →
// page text → AI extracts candidate offers with verbatim quotes → each quote is
// verified against the page text → pure normalisation/aggregation.
// Only the service, cleaning type and city/region name are sent out — never an
// address, name, phone or any other personal data.
import {
  aggregate, CLEANING_QUERY_HE, isVerified, normalizeCleaning, regionFor,
  summaryIsFresh, PRICE_SUMMARY_TTL_MS,
  type AppliedOffer, type CleaningType, type OrderSpec, type RawOffer, type WebEstimate,
} from "../_shared/webPrices.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const AI_URL = "https://ai.gateway.lovable.dev/v1/responses";
export class ResearchError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function providerFailure(res: Response): Promise<never> {
  const body = await res.text();
  console.error(`[prices] provider failed [${res.status}]: ${body}`);
  let message = body.slice(0, 300);
  try { message = JSON.parse(body).message ?? message; } catch { /* non-JSON */ }
  throw new ResearchError(res.status, message);
}

type Page = { url: string; text: string };

async function search(query: string): Promise<Page[]> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!lovableKey || !fcKey) throw new Error("search_not_configured");
  const res = await fetch(`${GATEWAY}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": fcKey },
    body: JSON.stringify({ query, limit: 8, country: "IL", lang: "he",
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) return providerFailure(res);
  const j = await res.json();
  const items: Array<{ url?: string; markdown?: string }> = j?.data?.web ?? j?.data ?? [];
  return items.flatMap((i) => typeof i.url === "string" && typeof i.markdown === "string" ? [{ url: i.url, text: i.markdown.slice(0, 48000) }] : []);
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
  if (!res.ok) return providerFailure(res);
  if (!res.body) return [];
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

async function offersFor(place: string, spec: OrderSpec, geography: "city" | "region"): Promise<{ offers: AppliedOffer[]; checkedAt: string }> {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new Error("summary_storage_not_configured");
  const db = createClient(url, secret);
  const cacheKey = JSON.stringify(["cleaning-v3", place, spec.cleaningType]);
  const { data: saved, error: readError } = await db.from("web_price_summaries").select("offers,expires_at,checked_at").eq("cache_key", cacheKey).maybeSingle();
  if (readError) throw new Error(`summary_read_failed: ${readError.message}`);
  const apply = (groups: Array<{ offers: RawOffer[] }>) => groups.flatMap(({ offers }) => {
    const windowPrices = offers.filter((o) => o.unit === "per_window" && !o.isFromPrice).map((o) => o.price);
    return offers.flatMap((o) => normalizeCleaning(o, spec, windowPrices.length === 1 ? windowPrices[0] : null));
  });
  if (saved && summaryIsFresh(saved.expires_at)) return { offers: apply(saved.offers), checkedAt: saved.checked_at };
  const { data: pause, error: pauseError } = await db.from("web_price_research_state").select("status,reason").eq("id", "cleaning").maybeSingle();
  if (pauseError) throw new Error("research_state_unavailable");
  if (pause) throw new ResearchError(pause.status, pause.reason);
  try {
  let pages: Page[] = [];
    const [a, b] = await Promise.all([
      search(`${CLEANING_QUERY_HE[spec.cleaningType]} ${place}`),
      search(`${CLEANING_QUERY_HE[spec.cleaningType]} ${place} מ"ר מחירון`),
    ]);
    const seen = new Set<string>();
    pages = [...a, ...b].filter((p) => !seen.has(p.url) && seen.add(p.url));
  // A page counts for this geography only if it mentions the place itself.
  const relevant = pages.filter((p) => p.text.includes(place.split(" ")[0]));
  const extracted: Array<{ p: Page; offers: RawOffer[] }> = [];
  for (const p of relevant) extracted.push({ p, offers: await extract(p) });
  const groups = extracted.map(({ p, offers }) => ({ url: p.url, offers: offers.filter((o) => isVerified(o, p.text)) })).filter((g) => g.offers.length);
  // Never replace the last successful summary with an empty or failed update.
  const checkedAt = new Date().toISOString();
  if (groups.length) {
    const { error } = await db.from("web_price_summaries").upsert({ cache_key: cacheKey, service: "cleaning", geography, place,
      applicability: { cleaningType: spec.cleaningType, composition: "source-specific", normalization: "per_m2_or_explicit_area_range" }, currency: "ILS", offers: groups,
      checked_at: checkedAt, expires_at: new Date(Date.now() + PRICE_SUMMARY_TTL_MS).toISOString() });
    if (error) throw new Error(`summary_save_failed: ${error.message}`);
  }
  const applied = apply(groups);
  console.info("[prices]", JSON.stringify({ place, pages: pages.length, relevant: relevant.length,
    extracted: extracted.reduce((n, x) => n + x.offers.length, 0),
    verified: extracted.reduce((n, x) => n + x.offers.filter((o) => isVerified(o, x.p.text)).length, 0), applied: applied.length }));
  if (Deno.env.get("PRICES_DEBUG")) console.info(JSON.stringify(extracted.map((x) => x.offers.map((o) => [o.unit, o.cleaningType, o.price, o.areaMin, o.areaMax, isVerified(o, x.p.text), o.quote.slice(0, 80)]))));
  return { offers: applied, checkedAt };
  } catch (error) {
    if (error instanceof ResearchError && (error.status === 402 || error.status === 403)) {
      await db.from("web_price_research_state").upsert({ id: "cleaning", status: error.status, reason: error.message, paused_at: new Date().toISOString() });
    }
    throw error;
  }
}

export async function researchCleaning(cityHe: string, spec: OrderSpec): Promise<WebEstimate> {
  const city = await offersFor(cityHe, spec, "city");
  let result = aggregate(city.offers, "city", cityHe, city.checkedAt);
  if (result.status !== "available") {
    const region = regionFor(cityHe);
    if (region) {
      const regional = await offersFor(region, spec, "region");
      result = aggregate(regional.offers, "region", region, regional.checkedAt);
    }
  }
  return result;
}
