/** Native OpenAI search evidence, not URLs invented in answer text. */
export type SearchEvidence = { provider: "openai" | "lovable"; queries: string[]; sources: Array<{ url: string; title: string }> };
export function openAIStreamFailure(event: Record<string, any>): { status: number; reason: string } {
  const error = event.response?.error ?? event.error ?? event;
  const code = typeof error.code === "string" ? error.code : "stream_failed";
  const quota = error.type === "insufficient_quota" || code === "credit_balance_exhausted";
  return { status: quota ? 402 : error.type === "permission_denied" ? 403 : 502, reason: `openai:${code}` };
}
export function publicSourceUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && (!u.port || u.port === "443") &&
      !/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(u.hostname) &&
      !/^[\d.]+$/.test(u.hostname) && !u.hostname.includes(":") && u.hostname.includes(".");
  } catch { return false; }
}
export function searchEvidence(output: Array<Record<string, any>>): SearchEvidence {
  const sources = new Map<string, string>();
  const queries: string[] = [];
  for (const item of output) {
    if (item.type === "web_search_call" && item.status === "completed") {
      for (const q of item.action?.queries ?? (item.action?.query ? [item.action.query] : [])) {
        if (typeof q === "string") queries.push(q);
      }
      for (const s of item.action?.sources ?? []) {
        if (typeof s.url === "string" && publicSourceUrl(s.url)) sources.set(s.url, String(s.title ?? ""));
      }
    }
    if (item.type === "message") for (const part of item.content ?? []) {
      for (const a of part.annotations ?? []) {
        if (a.type === "url_citation" && typeof a.url === "string" && publicSourceUrl(a.url)) sources.set(a.url, String(a.title ?? ""));
      }
    }
  }
  return { provider: "openai", queries: [...new Set(queries)], sources: [...sources].map(([url, title]) => ({ url, title })) };
}