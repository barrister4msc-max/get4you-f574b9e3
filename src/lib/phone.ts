/**
 * Phone normalization for Israel (IL) and Cyprus (CY).
 * Stores internally in E.164 format.
 * Does NOT mutate verified phones — caller decides whether to overwrite.
 */

export type SupportedCountry = 'IL' | 'CY';

export interface NormalizeResult {
  ok: boolean;
  e164?: string;
  country?: SupportedCountry;
  error?: string;
}

/** Strip spaces, dashes, brackets, dots. Keep digits and a single leading '+'. */
function cleanInput(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Israel numbers (mobile + landline).
 * Mobile prefixes: 050-059 (10 digits local, drop leading 0 → +972 + 9).
 * Landline prefixes: 02,03,04,08,09 (9 digits local, drop leading 0 → +972 + 8).
 */
function normalizeIL(cleaned: string): NormalizeResult {
  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

  if (digits.startsWith('972')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Mobile: 9 digits starting with 5X
  if (/^5\d{8}$/.test(digits)) {
    return { ok: true, e164: `+972${digits}`, country: 'IL' };
  }
  // Landline: 8 digits starting with 2,3,4,8,9
  if (/^[23489]\d{7}$/.test(digits)) {
    return { ok: true, e164: `+972${digits}`, country: 'IL' };
  }
  return { ok: false, error: 'Invalid Israel phone number' };
}

/**
 * Cyprus numbers (mobile + landline). 8 digits local.
 * Mobile starts with 9. Landline starts with 2.
 */
function normalizeCY(cleaned: string): NormalizeResult {
  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

  if (digits.startsWith('357')) {
    digits = digits.slice(3);
  }

  if (/^9\d{7}$/.test(digits) || /^2\d{7}$/.test(digits)) {
    return { ok: true, e164: `+357${digits}`, country: 'CY' };
  }
  return { ok: false, error: 'Invalid Cyprus phone number' };
}

/** Detect country from E.164/plus prefix. Returns null when ambiguous. */
function detectCountry(cleaned: string): SupportedCountry | null {
  if (cleaned.startsWith('+972') || cleaned.startsWith('972')) return 'IL';
  if (cleaned.startsWith('+357') || cleaned.startsWith('357')) return 'CY';
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  // Bare 8-digit local Cyprus number (mobile 9X or landline 2X), no leading 0.
  if (/^[29]\d{7}$/.test(digits)) return 'CY';
  return null;
}

/**
 * Normalize a phone number to E.164.
 * @param input raw user input
 * @param country optional hint; if omitted, inferred from prefix, defaulting to IL.
 */
export function normalizePhone(input: string, country?: SupportedCountry): NormalizeResult {
  const cleaned = cleanInput(input);
  if (!cleaned) return { ok: false, error: 'Empty phone' };

  const detected = detectCountry(cleaned);
  const target: SupportedCountry = country ?? detected ?? 'IL';

  return target === 'CY' ? normalizeCY(cleaned) : normalizeIL(cleaned);
}

/** Convenience boolean check. */
export function isValidPhone(input: string, country?: SupportedCountry): boolean {
  return normalizePhone(input, country).ok;
}
