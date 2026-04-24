/**
 * Map raw Supabase / Postgres errors to a user-friendly message key.
 *
 * Frontend should never display raw error.message coming from Postgres
 * (e.g. "new row violates row-level security policy"). After RLS hardening
 * a number of writes that used to silently succeed now legitimately fail
 * for non-owners. Use `friendlyErrorMessage(error, fallback)` and feed the
 * result into `toast.error(...)`.
 */

type AnyError =
  | { code?: string; message?: string; status?: number }
  | Error
  | unknown;

const PERMISSION_HINTS = [
  "row-level security",
  "permission denied",
  "new row violates",
  "violates row-level",
];

function isPermissionError(err: AnyError): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code ?? "";
  const msg = ((err as { message?: string }).message ?? "").toLowerCase();
  // Postgres "insufficient_privilege" is 42501.
  if (code === "42501" || code === "PGRST301") return true;
  return PERMISSION_HINTS.some((h) => msg.includes(h));
}

/**
 * Returns a friendly message suitable for `toast.error`.
 * - On RLS / permission errors: a generic "not allowed" string.
 * - Otherwise: the provided fallback.
 * Never returns the raw Postgres error text.
 */
export function friendlyErrorMessage(err: AnyError, fallback: string): string {
  if (isPermissionError(err)) {
    return "You don't have permission to perform this action.";
  }
  return fallback;
}