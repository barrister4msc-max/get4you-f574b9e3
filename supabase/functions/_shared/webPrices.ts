// Pure logic for internet price research: verification, normalisation, aggregation.
// No network here — the edge function fetches pages and extracts candidate offers,
// this module decides which offers are real, comparable and how they combine.

export type CleaningType = "regular" | "deep" | "after_renovation" | "move_in_out";

/** Candidate offer extracted from one page. `quote` must be copied verbatim from the page. */
export type RawOffer = {
  url: string;
  quote: string;
  price: number;
  priceMax: number | null;   // upper end when the page states a range "A–B"
  unit: "per_job" | "per_m2" | "per_hour" | "per_window" | "per_room_job" | "other";
  cleaningType: CleaningType | null;
  areaMin: number | null;     // m² range this per-job price applies to
  areaMax: number | null;
  isFromPrice: boolean;       // "from ₪X"
  includesWindows: boolean | null;
  vatNote: string | null;
};

export type OrderSpec = { areaM2: number; cleaningType: CleaningType; windows: number | null; additionalWork?: boolean };
export type PriceGeography = "city" | "region" | "country";
export const PRICE_COUNTRY = "ישראל";

/** Country sampling accepts Israeli ILS pages, including offers for other Israeli cities. */
export function pageMatchesPriceGeography(text: string, place: string, geography: PriceGeography): boolean {
  return geography === "country"
    ? /[א-ת]/.test(text) && /₪|ש[״"']?ח|שקל|\bILS\b/.test(text)
    : text.includes(place.split(" ")[0]);
}

/** Stop at the first comparable scope; provider/storage failures are not missing prices. */
export async function estimateWithGeographyFallback(
  city: string,
  load: (place: string, geography: PriceGeography) => Promise<{ offers: AppliedOffer[]; checkedAt: string; evidence?: import("./searchEvidence.ts").SearchEvidence; cacheHit?: boolean }>,
): Promise<WebEstimate> {
  city = priceCityName(city);
  const region = regionFor(city);
  const scopes: Array<{ place: string; geography: PriceGeography }> = [
    { place: city, geography: "city" },
    ...(region ? [{ place: region, geography: "region" as const }] : []),
    { place: PRICE_COUNTRY, geography: "country" },
  ];
  let result: WebEstimate = { status: "unavailable", reason: "no_comparable_offers" };
  for (const scope of scopes) {
    const data = await load(scope.place, scope.geography);
    result = aggregate(data.offers, scope.geography, scope.place, data.checkedAt);
    if (result.status === "available") {
      result.provenance.search = data.evidence;
      result.provenance.cacheHit = data.cacheHit;
      return result;
    }
  }
  return result;
}

export type AppliedOffer = {
  url: string; quote: string; unit: RawOffer["unit"]; unitPrice: number;
  normalized: number; calc: string; isFromPrice: boolean;
};

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export const PRICE_SUMMARY_TTL_MS = 24 * 60 * 60 * 1000;
export function summaryIsFresh(expiresAt: string, now = Date.now()): boolean {
  return Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now;
}
const digits = (s: string) => s.replace(/[^\d]/g, "");

/** The quote must literally appear on the page and contain the price digits. */
export function isVerified(o: RawOffer, pageText: string): boolean {
  if (!o.quote || o.quote.length < 4 || !finite(o.price) || o.price <= 0) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").replace(/[*_|]/g, "").trim();
  if (!norm(pageText).includes(norm(o.quote))) return false;
  const d = digits(o.quote);
  return d.includes(String(Math.round(o.price))) && (!finite(o.priceMax) || d.includes(String(Math.round(o.priceMax))));
}

/**
 * Bring a verified offer to the order's size and composition, or reject it.
 * Hourly and per-room prices are never converted: that would require an invented
 * duration or m²-per-room assumption.
 */
export function normalizeCleaning(o: RawOffer, spec: OrderSpec, windowPrice: number | null): AppliedOffer[] {
  // Free-text extras have no documented unit/quantity: never price them as standard cleaning.
  if (spec.additionalWork) return [];
  const out: AppliedOffer[] = [];
  const prices = finite(o.priceMax) && o.priceMax > o.price ? [o.price, o.priceMax] : [o.price];
  for (const price of prices) {
    const a = normalizeOne({ ...o, price }, spec, windowPrice);
    if (a) out.push(a);
  }
  return out;
}

function normalizeOne(o: RawOffer, spec: OrderSpec, windowPrice: number | null): AppliedOffer | null {
  if (o.cleaningType !== spec.cleaningType) return null;
  let base: number; let calc: string;
  if (o.unit === "per_m2") {
    base = o.price * spec.areaM2; calc = `${o.price} ₪/m² × ${spec.areaM2} m²`;
  } else if (o.unit === "per_job" || (o.unit === "per_room_job" && (finite(o.areaMin) || finite(o.areaMax)))) {
    // A rooms-based price counts only when the page itself states the m² range.
    if (!finite(o.areaMin) && !finite(o.areaMax)) return null;
    if (finite(o.areaMin) && spec.areaM2 < o.areaMin) return null;
    if (finite(o.areaMax) && spec.areaM2 > o.areaMax) return null;
    base = o.price; calc = `${o.price} ₪ (${o.areaMin ?? "…"}–${o.areaMax ?? "…"} m²)`;
  } else return null;
  if (finite(spec.windows) && spec.windows > 0 && o.includesWindows !== true) {
    if (!finite(windowPrice)) return null;
    base += windowPrice * spec.windows; calc += ` + ${windowPrice} ₪ × ${spec.windows} windows`;
  }
  return { url: o.url, quote: o.quote, unit: o.unit, unitPrice: o.price, normalized: Math.round(base), calc, isFromPrice: o.isFromPrice };
}

export type WebEstimate =
  | { status: "available"; method: "web"; currency: "ILS"; min: number; max: number; recommended: number;
      provenance: { geography: PriceGeography; area: string; checkedAt: string; offers: AppliedOffer[]; search?: import("./searchEvidence.ts").SearchEvidence; cacheHit?: boolean } }
  | { status: "unavailable"; reason: string };

/** min = lowest, max = highest applicable price, recommended = round((min+max)/2). */
export function aggregate(offers: AppliedOffer[], geography: PriceGeography, area: string, checkedAt: string): WebEstimate {
  const ok = offers.filter((o) => finite(o.normalized) && o.normalized > 0);
  if (!ok.length) return { status: "unavailable", reason: "no_comparable_offers" };
  const prices = ok.map((o) => o.normalized);
  const min = Math.min(...prices); const max = Math.max(...prices);
  // A single "from" price is only a lower bound — it cannot define a range.
  if (min !== max || ok.every((o) => !o.isFromPrice)) {
    return { status: "available", method: "web", currency: "ILS", min, max, recommended: Math.round((min + max) / 2),
      provenance: { geography, area, checkedAt, offers: ok } };
  }
  return { status: "unavailable", reason: "only_from_prices" };
}

/** Israeli regions used when a city has no comparable offers (Hebrew search terms). */
const REGION_OF: Record<string, string> = {
  "חיפה": "חיפה והקריות", "קריית אתא": "חיפה והקריות", "קריית ביאליק": "חיפה והקריות", "קריית מוצקין": "חיפה והקריות",
  "קריית ים": "חיפה והקריות", "נשר": "חיפה והקריות", "טירת כרמל": "חיפה והקריות",
  "תל אביב-יפו": "גוש דן", "תל אביב": "גוש דן", "רמת גן": "גוש דן", "גבעתיים": "גוש דן", "בני ברק": "גוש דן",
  "חולון": "גוש דן", "בת ים": "גוש דן", "פתח תקווה": "גוש דן",
  "ירושלים": "אזור ירושלים", "בית שמש": "אזור ירושלים", "מבשרת ציון": "אזור ירושלים",
  "נתניה": "השרון", "הרצליה": "השרון", "רעננה": "השרון", "כפר סבא": "השרון", "הוד השרון": "השרון",
  "ראשון לציון": "השפלה", "רחובות": "השפלה", "נס ציונה": "השפלה", "מודיעין-מכבים-רעות": "השפלה", "לוד": "השפלה", "רמלה": "השפלה",
  "אשדוד": "הדרום", "אשקלון": "הדרום", "באר שבע": "הדרום", "אילת": "הדרום",
  "נצרת": "הצפון", "עפולה": "הצפון", "טבריה": "הצפון", "כרמיאל": "הצפון", "עכו": "הצפון", "נהריה": "הצפון",
};
/** OSM uses maqaf/en-dash spellings; search/cache use one public city spelling. */
export function priceCityName(cityHe: string): string {
  const name = cityHe.replace(/[־–—-]/g, " ").replace(/\s+/g, " ").trim();
  return name === "תל אביב יפו" ? "תל אביב" : name;
}
export const regionFor = (cityHe: string): string | null => {
  const canonical = priceCityName(cityHe);
  return REGION_OF[cityHe.trim()] ?? REGION_OF[canonical] ??
    Object.entries(REGION_OF).find(([city]) => priceCityName(city) === canonical)?.[1] ?? null;
};

export const CLEANING_QUERY_HE: Record<CleaningType, string> = {
  regular: "ניקיון בית שוטף מחיר",
  deep: "ניקיון יסודי לדירה מחירון",
  after_renovation: "ניקיון אחרי שיפוץ מחיר למ\"ר",
  move_in_out: "ניקיון דירה לפני כניסה מחיר",
};
