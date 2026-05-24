import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const BOT_API = "https://api.telegram.org/bot";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!INTERNAL_SECRET || !BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authn: internal secret OR service_role bearer
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
      await admin.from("app_events").insert({ event_type, entity_type: "telegram_send", metadata });
    } catch (_) { /* swallow */ }
  };

  // Feature flag check
  const { data: settings } = await admin
    .from("app_settings").select("value").eq("key", "telegram").maybeSingle();
  const flag = (settings?.value ?? {}) as {
    enabled?: boolean; test_user_ids?: string[];
  };

  let body: { user_id?: string; chat_id?: number; text?: string; event?: string } = {};
  try { body = await req.json(); } catch (_) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { user_id, text, event } = body;
  let { chat_id } = body;

  if (!text || typeof text !== "string" || text.length > 4000) {
    return new Response(JSON.stringify({ error: "Invalid text" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let resolvedUserId = user_id ?? null;

  if (!chat_id) {
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id or chat_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: prof } = await admin.from("profiles")
      .select("telegram_chat_id, telegram_opt_in")
      .eq("user_id", user_id).maybeSingle();
    if (!prof?.telegram_chat_id || !prof?.telegram_opt_in) {
      await logEvent("telegram.send_skipped_no_optin", { user_id, event });
      return new Response(JSON.stringify({ ok: false, skipped: "no_optin" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    chat_id = prof.telegram_chat_id;
  }

  const enabled = !!flag.enabled;
  const inTestList = !!(resolvedUserId && Array.isArray(flag.test_user_ids) && flag.test_user_ids.includes(resolvedUserId));
  if (!enabled && !inTestList) {
    await logEvent("telegram.send_disabled", { user_id: resolvedUserId, event });
    return new Response(JSON.stringify({ ok: false, skipped: "feature_disabled" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 8000);

let resp: Response;

try {
  resp = await fetch(`${BOT_API}${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
} finally {
  clearTimeout(timeoutId);
}
    const data = await resp.json().catch(() => ({} as Record<string, unknown>));
    if (!resp.ok || !(data as { ok?: boolean }).ok) {
      const errMsg = `telegram ${resp.status}: ${JSON.stringify(data)}`;
      await logEvent("telegram.send_failed", { user_id: resolvedUserId, chat_id, event, error: errMsg });
      return new Response(JSON.stringify({ ok: false, error: errMsg }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const messageId = ((data as { result?: { message_id?: number } }).result?.message_id) ?? null;
    await admin.from("telegram_logs").insert({
      user_id: resolvedUserId, chat_id, event: event ?? null, status: "sent",
      message_id: messageId, sent_at: new Date().toISOString(),
      metadata: { text_len: text.length },
    });
    await logEvent("telegram.sent", { user_id: resolvedUserId, chat_id, event, message_id: messageId });
    return new Response(JSON.stringify({ ok: true, message_id: messageId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logEvent("telegram.send_exception", { user_id: resolvedUserId, chat_id, event, error: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
