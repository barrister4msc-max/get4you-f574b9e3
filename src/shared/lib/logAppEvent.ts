import { supabase } from "@/integrations/supabase/client";

/**
 * Allowed non-critical frontend event types.
 * Keep this list narrow — this helper is NOT for business-critical logging.
 */
export type FrontendAppEventType =
  | "admin.page_access_denied"
  | "payment.button_clicked"
  | "payment.ui_error"
  | "task.create_ui_error"
  | "chat.send_ui_error";

export interface LogAppEventInput {
  event_type: FrontendAppEventType;
  entity_type?: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
}

// Keys we will strip from metadata before insert. Defense-in-depth: callers
// must not pass sensitive data, but we double-check here.
const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /card/i,
  /cvv/i,
  /cvc/i,
  /pan\b/i,
  /pin/i,
  /payment[_-]?payload/i,
  /allpay[_-]?response/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[truncated]";

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }

  if (typeof value === "string") {
    // Cap string length to avoid logging huge blobs.
    return value.length > 1000 ? value.slice(0, 1000) + "…" : value;
  }

  return value;
}

/**
 * Fire-and-forget logger for non-critical frontend events.
 *
 * - Never throws.
 * - Never blocks the user flow (errors are swallowed).
 * - Strips obviously-sensitive fields from metadata.
 */
export async function logAppEvent(input: LogAppEventInput): Promise<void> {
  try {
    const safeMetadata =
      input.metadata && typeof input.metadata === "object"
        ? (sanitize(input.metadata) as Record<string, unknown>)
        : {};

    let actorId: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      actorId = data.user?.id ?? null;
    } catch {
      actorId = null;
    }

    await supabase.from("app_events").insert([
      {
        actor_id: actorId ?? undefined,
        event_type: input.event_type,
        entity_type: input.entity_type ?? undefined,
        entity_id: input.entity_id ?? undefined,
        metadata: safeMetadata as never,
      },
    ]);
  } catch {
    // Intentionally swallow all errors — logging must never break user flow.
  }
}

export default logAppEvent;