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

export type OrderSpec = { areaM2: number; cleaningType: CleaningType; windows: number | null };

export type AppliedOffer = {
  url: string; quote: string; unit: RawOffer["unit"]; unitPrice: number;
  normalized: number; calc: string; isFromPrice: boolean;
};

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
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
    base = o.price * spec.areaM2; calc = `${o.price} ₪/м² × ${spec.areaM2} м²`;
  } else if (o.unit === "per_job" || (o.unit === "per_room_job" && (finite(o.areaMin) || finite(o.areaMax)))) {
    // A rooms-based price counts only when the page itself states the m² range.
    if (!finite(o.areaMin) && !finite(o.areaMax)) return null;
    if (finite(o.areaMin) && spec.areaM2 < o.areaMin) return null;
    if (finite(o.areaMax) && spec.areaM2 > o.areaMax) return null;
    base = o.price; calc = `${o.price} ₪ за заказ (${o.areaMin ?? "…"}–${o.areaMax ?? "…"} м²)`;
  } else return null;
  if (finite(spec.windows) && spec.windows > 0 && o.includesWindows !== true) {
    if (!finite(windowPrice)) return null;
    base += windowPrice * spec.windows; calc += ` + ${windowPrice} ₪ × ${spec.windows} окон`;
  }
  return { url: o.url, quote: o.quote, unit: o.unit, unitPrice: o.price, normalized: Math.round(base), calc, isFromPrice: o.isFromPrice };
}

export type WebEstimate =
  | { status: "available"; method: "web"; currency: "ILS"; min: number; max: number; recommended: number;
      provenance: { geography: "city" | "region"; area: string; checkedAt: string; offers: AppliedOffer[] } }
  | { status: "unavailable"; reason: string };

/** min = lowest, max = highest applicable price, recommended = round((min+max)/2). */
export function aggregate(offers: AppliedOffer[], geography: "city" | "region", area: string, checkedAt: string): WebEstimate {
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
export const regionFor = (cityHe: string): string | null => REGION_OF[cityHe.trim()] ?? null;

export const CLEANING_QUERY_HE: Record<CleaningType, string> = {
  regular: "ניקיון בית שוטף מחיר",
  deep: "ניקיון יסודי לדירה מחירון",
  after_renovation: "ניקיון אחרי שיפוץ מחיר למ\"ר",
  move_in_out: "ניקיון דירה לפני כניסה מחיר",
};
