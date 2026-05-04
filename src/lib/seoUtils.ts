/**
 * Build a slug from a URL pathname.
 * Strips leading/trailing slashes and collapses any duplicates so
 * "/tel-aviv//cleaning/" → "tel-aviv/cleaning".
 */
export function slugFromPath(pathname: string): string {
  return pathname.replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Build a normalized canonical URL for a SEO page on 4you.ai.
 * Removes duplicate slashes anywhere in the path and guarantees
 * exactly one leading slash after the origin.
 */
export function buildCanonical(
  pathOrSlug: string | null | undefined,
  origin = "https://4you.ai",
): string {
  const raw = (pathOrSlug ?? "").trim();
  const cleaned = raw.replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned ? `${origin}/${cleaned}` : `${origin}/`;
}

// In-memory cache for SEO rows keyed by slug.
// Lives for the SPA session — invalidated only on full reload.
type AnyRow = Record<string, unknown> | null;
const seoCache = new Map<string, { row: AnyRow; at: number }>();
const SEO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedSeo(slug: string): AnyRow | undefined {
  const hit = seoCache.get(slug);
  if (!hit) return undefined;
  if (Date.now() - hit.at > SEO_CACHE_TTL_MS) {
    seoCache.delete(slug);
    return undefined;
  }
  return hit.row;
}

export function setCachedSeo(slug: string, row: AnyRow): void {
  seoCache.set(slug, { row, at: Date.now() });
}

export function clearSeoCache(): void {
  seoCache.clear();
}