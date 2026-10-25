import { supabase } from "@/integrations/supabase/client";

export type GeoPriceConfidence = "limited" | "medium" | "high";

export type GeoMarketplacePriceStats = {
  city_slug: string;
  category_slug: string;
  sample_size: number;
  p25_price: number;
  median_price: number;
  p75_price: number;
  currency: "ILS";
  period_start: string | null;
  period_end: string | null;
  confidence: GeoPriceConfidence;
  source: "marketplace_history";
  scope: "city_category";
  calculated_at: string;
};

/**
 * Fetch aggregate-only marketplace statistics for a public GEO page.
 *
 * Fail closed:
 * - returns null for city-only/category-only pages;
 * - returns null when the RPC reports insufficient sample size;
 * - returns null on an RPC error;
 * - accepts marketplace_history rows only, never AI-derived estimates.
 */
export async function getGeoMarketplacePriceStats(
  citySlug: string | null | undefined,
  categorySlug: string | null | undefined,
): Promise<GeoMarketplacePriceStats | null> {
  if (!citySlug || !categorySlug) return null;

  const { data, error } = await supabase.rpc(
    "get_geo_marketplace_price_stats" as never,
    {
      _city_slug: citySlug,
      _category_slug: categorySlug,
      _lookback_days: 180,
      _min_sample_size: 10,
    } as never,
  );

  if (error) {
    console.warn("GEO marketplace price stats unavailable", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object") return null;

  const candidate = row as unknown as GeoMarketplacePriceStats;
  if (
    candidate.source !== "marketplace_history" ||
    candidate.scope !== "city_category" ||
    candidate.sample_size < 10 ||
    !Number.isFinite(Number(candidate.p25_price)) ||
    !Number.isFinite(Number(candidate.median_price)) ||
    !Number.isFinite(Number(candidate.p75_price))
  ) {
    return null;
  }

  return {
    ...candidate,
    sample_size: Number(candidate.sample_size),
    p25_price: Number(candidate.p25_price),
    median_price: Number(candidate.median_price),
    p75_price: Number(candidate.p75_price),
  };
}

export function formatIls(value: number, locale = "en"): string {
  const localeMap: Record<string, string> = {
    en: "en-IL",
    ru: "ru-IL",
    he: "he-IL",
    ar: "ar-IL",
  };
  return new Intl.NumberFormat(localeMap[locale] || "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}
