/**
 * Single source of truth for the platform-wide minimum task price.
 *
 * The canonical minimum is expressed in USD; for every other currency we
 * convert at the current exchange rate (or a safe fallback). This keeps
 * the rule "minimum task price ≥ $50 USD equivalent" enforceable on the
 * frontend, the AI suggester, the edge functions and the database.
 */

export const MIN_PRICE_USD = 50;

const USD_ILS_FALLBACK = 3.7;

export type SupportedCurrency = "USD" | "ILS" | string;

/** Returns the platform minimum task price expressed in `currency`. */
export function getMinPrice(
  currency: SupportedCurrency,
  rates?: Record<string, number> | null,
): number {
  const cur = (currency || "USD").toUpperCase();
  if (cur === "USD") return MIN_PRICE_USD;
  const ilsRate = rates?.ILS ?? USD_ILS_FALLBACK;
  if (cur === "ILS") return Math.ceil(MIN_PRICE_USD * ilsRate);
  // Generic fallback for any future currency for which we have a USD rate.
  const rate = rates?.[cur];
  if (rate && rate > 0) return Math.ceil(MIN_PRICE_USD * rate);
  return MIN_PRICE_USD;
}

/** Human-readable price label for messages, e.g. `$50` or `₪185`. */
export function formatMinPriceLabel(
  currency: SupportedCurrency,
  rates?: Record<string, number> | null,
): string {
  const cur = (currency || "USD").toUpperCase();
  const value = getMinPrice(cur, rates);
  if (cur === "USD") return `$${value}`;
  if (cur === "ILS") return `₪${value}`;
  return `${value} ${cur}`;
}

/** Localized "Minimum task price is …" message. */
export function formatMinPriceMessage(
  currency: SupportedCurrency,
  rates?: Record<string, number> | null,
): string {
  const cur = (currency || "USD").toUpperCase();
  if (cur === "USD") return `Minimum task price is $${MIN_PRICE_USD}.`;
  return `Minimum task price is ${formatMinPriceLabel(cur, rates)} (equivalent of $${MIN_PRICE_USD}).`;
}

/** Clamp any suggested/AI price up to the platform minimum. */
export function clampToMin(
  price: number,
  currency: SupportedCurrency,
  rates?: Record<string, number> | null,
): number {
  const min = getMinPrice(currency, rates);
  if (!Number.isFinite(price) || price < min) return min;
  return Math.round(price);
}