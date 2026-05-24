import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 5;

function genCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const logEvent = async (event_type: string, metadata: Record<string, unknown>, actor?: string | null) => {
    try {
      await admin.from("app_events").insert({
        event_type, entity_type: "telegram_link_codes",
        actor_user_id: actor ?? null, metadata,
      });
    } catch (_) { /* swallow */ }
  };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.slice("Bearer ".length);
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Rate limit: max RATE_MAX requests / RATE_WINDOW_MS per user
    const { data: rl } = await admin
      .from("telegram_link_code_rl")
      .select("user_id, window_start, attempts")
      .eq("user_id", userId)
      .maybeSingle();
    const now = Date.now();
    if (rl) {
      const winStart = new Date(rl.window_start).getTime();
      if (now - winStart < RATE_WINDOW_MS) {
        if (rl.attempts >= RATE_MAX) {
          await logEvent("telegram.link_code_rate_limited", { attempts: rl.attempts }, userId);
          return new Response(JSON.stringify({ error: "Too many requests" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await admin.from("telegram_link_code_rl")
          .update({ attempts: rl.attempts + 1 })
          .eq("user_id", userId);
      } else {
        await admin.from("telegram_link_code_rl")
          .update({ window_start: new Date(now).toISOString(), attempts: 1 })
          .eq("user_id", userId);
      }
    } else {
      await admin.from("telegram_link_code_rl").insert({
        user_id: userId, window_start: new Date(now).toISOString(), attempts: 1,
      });
    }

    const code = genCode();
    const expiresAt = new Date(now + 15 * 60 * 1000).toISOString();
    const { error: insErr } = await admin.from("telegram_link_codes").insert({
      code, user_id: userId, expires_at: expiresAt,
    });
    if (insErr) {
      await logEvent("telegram.link_code_insert_failed", { error: insErr.message }, userId);
      return new Response(JSON.stringify({ error: "Could not create code" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bot username from app_settings (optional)
    let botUsername: string | null = null;
    try {
      const { data: settings } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "telegram")
        .maybeSingle();
      const v = (settings?.value ?? {}) as { bot_username?: string };
      botUsername = v?.bot_username ?? null;
    } catch (_) { /* ignore */ }

    const deepLink = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;

    await logEvent("telegram.link_code_issued", { code_prefix: code.slice(0, 4) }, userId);

    return new Response(
      JSON.stringify({ code, expires_at: expiresAt, bot_username: botUsername, deep_link: deepLink }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});