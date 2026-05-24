import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const MAX_ATTEMPTS = 5;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!INTERNAL_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const incoming = req.headers.get("x-internal-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isInternal = safeEqual(incoming, INTERNAL_SECRET);
  let isServiceRole = false;
  if (!isInternal && auth.startsWith("Bearer ")) {
    try {
      const payloadB64 = auth.slice("Bearer ".length).split(".")[1] ?? "";
      const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
      const claims = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
      if (claims?.role === "service_role") isServiceRole = true;
    } catch (_) { /* ignore */ }
  }
  if (!isInternal && !isServiceRole) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const logEvent = async (event_type: string, metadata: Record<string, unknown>) => {
    try {
      await admin.from("app_events").insert({
        event_type, entity_type: "telegram_queue", metadata,
      });
    } catch (_) { /* swallow */ }
  };

  let limit = 20;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 100) limit = body.limit;
    }
  } catch (_) { /* ignore */ }

  const nowIso = new Date().toISOString();

  // Claim rows: status pending/retry AND next_attempt_at <= now
  const { data: candidates, error: selErr } = await admin
    .from("telegram_queue")
    .select("id, user_id, chat_id, event, payload, attempts")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  if (selErr) {
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = candidates ?? [];
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    // Mark in-progress to avoid concurrent reprocessing
    const { error: lockErr } = await admin
      .from("telegram_queue")
      .update({ status: "sending", updated_at: nowIso })
      .eq("id", row.id)
      .in("status", ["pending", "retry"]);
    if (lockErr) {
      results.push({ id: row.id, ok: false, skipped: "lock_failed" });
      continue;
    }

    const payload = (row.payload ?? {}) as { text?: string };
    if (!payload?.text) {
      await admin.from("telegram_queue").update({
        status: "failed", last_error: "missing text", updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      await logEvent("telegram.queue_failed", { id: row.id, error: "missing text" });
      results.push({ id: row.id, ok: false, error: "missing text" });
      continue;
    }

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-telegram`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
        },
        body: JSON.stringify({
          user_id: row.user_id ?? undefined,
          chat_id: row.chat_id ?? undefined,
          text: payload.text,
          event: row.event ?? undefined,
        }),
      });
      const data = await resp.json().catch(() => ({} as Record<string, unknown>));
      if (resp.ok && (data as { ok?: boolean }).ok) {
        await admin.from("telegram_queue").update({
          status: "sent", updated_at: new Date().toISOString(), last_error: null,
        }).eq("id", row.id);
        results.push({ id: row.id, ok: true });
      } else if (resp.ok && (data as { skipped?: string }).skipped) {
        // Soft skip (no opt-in / feature disabled) — terminal, not retryable
        await admin.from("telegram_queue").update({
          status: "skipped",
          last_error: String((data as { skipped?: string }).skipped),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        results.push({ id: row.id, ok: false, skipped: (data as { skipped?: string }).skipped });
      } else {
        const errMsg = (data as { error?: string }).error ?? `status ${resp.status}`;
        const nextAttempts = (row.attempts ?? 0) + 1;
        if (nextAttempts >= MAX_ATTEMPTS) {
          await admin.from("telegram_queue").update({
            status: "failed", attempts: nextAttempts, last_error: errMsg,
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
          await logEvent("telegram.queue_failed", { id: row.id, error: errMsg, attempts: nextAttempts });
        } else {
          const backoffMs = Math.min(60_000 * 2 ** nextAttempts, 60 * 60_000);
          await admin.from("telegram_queue").update({
            status: "retry", attempts: nextAttempts, last_error: errMsg,
            next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
          await logEvent("telegram.queue_retry", { id: row.id, error: errMsg, attempts: nextAttempts });
        }
        results.push({ id: row.id, ok: false, error: errMsg });
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const nextAttempts = (row.attempts ?? 0) + 1;
      if (nextAttempts >= MAX_ATTEMPTS) {
        await admin.from("telegram_queue").update({
          status: "failed", attempts: nextAttempts, last_error: errMsg,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
      } else {
        const backoffMs = Math.min(60_000 * 2 ** nextAttempts, 60 * 60_000);
        await admin.from("telegram_queue").update({
          status: "retry", attempts: nextAttempts, last_error: errMsg,
          next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
      await logEvent("telegram.queue_exception", { id: row.id, error: errMsg });
      results.push({ id: row.id, ok: false, error: errMsg });
    }
  }

  return new Response(
    JSON.stringify({ success: true, processed: results.length, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});