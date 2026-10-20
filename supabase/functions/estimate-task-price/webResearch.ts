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
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
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
    body: JSON.stringify({ query, limit: 6, country: "IL", lang: "he", tbs: "qdr:y",
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`search_failed_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const items: Array<{ url?: string; markdown?: string }> = j?.data?.web ?? j?.data ?? [];
  return items.filter((i) => i.url && i.markdown).map((i) => ({ url: i.url!, text: i.markdown!.slice(0, 14000) }));
}

const OFFER_SCHEMA = {
  type: "object",
  properties: {
    offers: { type: "array", items: { type: "object", properties: {
      quote: { type: "string", description: "Exact substring copied from the page that contains the price" },
      price: { type: "number" },
      unit: { type: "string", enum: ["per_job", "per_m2", "per_hour", "per_window", "per_room_job", "other"] },
      cleaning_type: { type: "string", enum: ["regular", "deep", "after_renovation", "move_in_out", "unknown"] },
      area_min: { type: ["number", "null"] }, area_max: { type: ["number", "null"] },
      is_from_price: { type: "boolean" }, includes_windows: { type: ["boolean", "null"] },
      vat_note: { type: ["string", "null"] },
    }, required: ["quote", "price", "unit", "cleaning_type", "is_from_price"] } },
  },
  required: ["offers"],
};

async function extract(page: Page): Promise<RawOffer[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return [];
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content:
          "Extract residential cleaning price offers in ILS from the page. Copy `quote` verbatim from the page (it must contain the number). " +
          "Use unit per_m2 only when the price is explicitly per square metre; per_job with area_min/area_max only when the page states the m² range; " +
          "per_room_job when the price is by number of rooms; per_hour for hourly. Mark 'from/החל מ/מ-' prices as is_from_price. " +
          "cleaning_type: regular=ongoing/שוטף, deep=יסודי/כללי, after_renovation=אחרי שיפוץ, move_in_out=לפני כניסה/אחרי יציאה. Never invent numbers." },
        { role: "user", content: `URL: ${page.url}\n\n${page.text}` },
      ],
      tools: [{ type: "function", function: { name: "offers", description: "Price offers found", parameters: OFFER_SCHEMA } }],
      tool_choice: { type: "function", function: { name: "offers" } },
    }),
  });
  if (!res.ok) { console.warn("[prices] extract failed", res.status); return []; }
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  let parsed: { offers?: Array<Record<string, unknown>> } = {};
  try { parsed = JSON.parse(args ?? "{}"); } catch { return []; }
  return (parsed.offers ?? []).map((o) => ({
    url: page.url, quote: String(o.quote ?? ""), price: Number(o.price),
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
  const pages = await search(`${CLEANING_QUERY_HE[spec.cleaningType]} ${place}`);
  // A page counts for this geography only if it mentions the place itself.
  const relevant = pages.filter((p) => p.text.includes(place.split(" ")[0]));
  const extracted = await Promise.all(relevant.map(async (p) => ({ p, offers: await extract(p).catch(() => []) })));
  const applied: AppliedOffer[] = [];
  for (const { p, offers } of extracted) {
    const verified = offers.filter((o) => isVerified(o, p.text));
    const windowPrices = verified.filter((o) => o.unit === "per_window" && !o.isFromPrice).map((o) => o.price);
    const windowPrice = windowPrices.length === 1 ? windowPrices[0] : null; // ambiguous → none
    for (const o of verified) {
      const a = normalizeCleaning(o, spec, windowPrice);
      if (a) applied.push(a);
    }
  }
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
