/**
 * Allpay SHA256 signature helper, extracted for unit testing.
 * Algorithm:
 * - sort top-level keys alphabetically
 * - ignore "sign"
 * - collect non-empty string values
 * - for arrays of objects: sort item keys and collect non-empty string/number values
 * - numeric values are stringified (including 0)
 * - join with ":" and append ":" + apiKey
 * - sha256 hex
 */
export async function getApiSignatureAsync(
  params: Record<string, unknown>,
  apiKey: string,
): Promise<string> {
  const signatureString = buildSignatureString(params, apiKey);
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Exposed for unit tests so we can inspect what gets signed. */
export function buildSignatureString(
  params: Record<string, unknown>,
  apiKey: string,
): string {
  const sortedKeys = Object.keys(params).sort();
  const chunks: string[] = [];

  for (const key of sortedKeys) {
    if (key === "sign") continue;
    const value = params[key];

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          const itemKeys = Object.keys(item as Record<string, unknown>).sort();
          for (const name of itemKeys) {
            const val = (item as Record<string, unknown>)[name];
            if (typeof val === "string" && val.trim() !== "") {
              chunks.push(val);
            } else if (typeof val === "number" && Number.isFinite(val)) {
              chunks.push(String(val));
            }
          }
        }
      }
    } else if (typeof value === "string" && value.trim() !== "") {
      chunks.push(value);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      chunks.push(String(value));
    }
  }

  return chunks.join(":") + ":" + apiKey;
}