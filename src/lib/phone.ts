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
 * Israel mobile prefixes: 050,051,052,053,054,055,056,058,059.
 * Local form: 0XXXXXXXXX (10 digits). E.164: +972 + 9 digits (drop leading 0).
 */
function normalizeIL(cleaned: string): NormalizeResult {
  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

  if (digits.startsWith('972')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (!/^\d{9}$/.test(digits)) {
    return { ok: false, error: 'Invalid Israel phone length' };
  }
  if (!/^5[0-9]/.test(digits)) {
    return { ok: false, error: 'Invalid Israel mobile prefix' };
  }
  return { ok: true, e164: `+972${digits}`, country: 'IL' };
}

/**
 * Cyprus mobile prefixes: 94,95,96,97,99 (8 digits local).
 * E.164: +357 + 8 digits.
 */
function normalizeCY(cleaned: string): NormalizeResult {
  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

  if (digits.startsWith('357')) {
    digits = digits.slice(3);
  }

  if (!/^\d{8}$/.test(digits)) {
    return { ok: false, error: 'Invalid Cyprus phone length' };
  }
  if (!/^(94|95|96|97|99)/.test(digits)) {
    return { ok: false, error: 'Invalid Cyprus mobile prefix' };
  }
  return { ok: true, e164: `+357${digits}`, country: 'CY' };
}

/** Detect country from E.164/plus prefix. Returns null when ambiguous. */
function detectCountry(cleaned: string): SupportedCountry | null {
  if (cleaned.startsWith('+972') || cleaned.startsWith('972')) return 'IL';
  if (cleaned.startsWith('+357') || cleaned.startsWith('357')) return 'CY';
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
