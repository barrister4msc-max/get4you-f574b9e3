import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!BOT_TOKEN || !WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const incoming = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(incoming, WEBHOOK_SECRET)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const logEvent = async (event_type: string, metadata: Record<string, unknown>) => {
    try {
      await admin.from("app_events").insert({
        event_type,
        entity_type: "telegram_webhook",
        metadata,
      });
    } catch (_) { /* swallow */ }
  };

  let update: Record<string, unknown> = {};
  try {
    update = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ ok: true, ignored: "bad-json" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const message = (update.message ?? update.edited_message) as
    | { chat?: { id?: number }; from?: { id?: number; username?: string }; text?: string }
    | undefined;
  const chatIdRaw = message?.chat?.id;
  const chatId = chatIdRaw != null ? String(chatIdRaw) : null;
  const text = (message?.text ?? "").trim();

  if (!chatId) {
    return new Response(JSON.stringify({ ok: true, ignored: "no-chat" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sendReply = async (body: string) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    try {
      await fetch(`${BOT_API}${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: body, parse_mode: "HTML" }),
        signal: ctl.signal,
      });
    } catch (e) {
      await logEvent("telegram.reply_error", { error: String(e), chat_id: chatId });
    } finally {
      clearTimeout(timer);
    }
  };

  // Handle /start <code>
  const m = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{6,64}))?$/);
  if (m) {
    const code = m[1];
    if (!code) {
      await sendReply("Welcome! To link your account, open your profile in the app and tap “Link Telegram”.");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: codeRow, error: codeErr } = await admin
      .from("telegram_link_codes")
      .select("code, user_id, expires_at, consumed_at")
      .eq("code", code)
      .maybeSingle();

    if (codeErr || !codeRow) {
      await sendReply("This link code is invalid. Please generate a new one in the app.");
      await logEvent("telegram.link_code_invalid", { chat_id: chatId, code });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (codeRow.consumed_at) {
      await sendReply("This code was already used. Please generate a new one in the app.");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(codeRow.expires_at).getTime() < Date.now()) {
      await sendReply("This link code has expired. Please generate a new one in the app.");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const username = message?.from?.username ?? null;
    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from("profiles")
      .update({
        telegram_chat_id: chatId,
        telegram_username: username,
        telegram_opt_in: true,
        telegram_opt_in_at: nowIso,
        telegram_opt_out_at: null,
        telegram_linked_at: nowIso,
      })
      .eq("user_id", codeRow.user_id);

    if (updErr) {
      await logEvent("telegram.link_failed", { chat_id: chatId, user_id: codeRow.user_id, error: updErr.message });
      await sendReply("Could not link your account. Please try again.");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin
      .from("telegram_link_codes")
      .update({ consumed_at: nowIso })
      .eq("code", code);

    await logEvent("telegram.linked", { chat_id: chatId, user_id: codeRow.user_id, username });
    await sendReply("✅ Your account is linked. You will only receive important notifications here.");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (/^\/stop\b/i.test(text)) {
    const { error } = await admin
      .from("profiles")
      .update({ telegram_opt_in: false, telegram_opt_out_at: new Date().toISOString() })
      .eq("telegram_chat_id", chatId);
    if (!error) {
      await logEvent("telegram.opt_out", { chat_id: chatId });
      await sendReply("You have unsubscribed. You will no longer receive notifications.");
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Default: ignore other messages silently
  return new Response(JSON.stringify({ ok: true, ignored: "unhandled" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});