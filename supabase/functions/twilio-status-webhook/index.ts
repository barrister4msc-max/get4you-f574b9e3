import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-twilio-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Twilio posts application/x-www-form-urlencoded with MessageSid + MessageStatus
// (queued | sending | sent | delivered | read | failed | undelivered).
// We update whatsapp_logs.delivery_status and trigger retry on terminal failures.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const ct = req.headers.get("content-type") || "";
    const params = new URLSearchParams(
      ct.includes("application/json") ? "" : await req.text(),
    );
    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({}));
      for (const [k, v] of Object.entries(j ?? {})) params.set(k, String(v));
    }

    const sid = params.get("MessageSid") || params.get("SmsSid") || "";
    const status = params.get("MessageStatus") || params.get("SmsStatus") || "";
    const errorCode = params.get("ErrorCode") || null;
    const errorMessage = params.get("ErrorMessage") || null;

    if (!sid || !status) {
      return new Response(JSON.stringify({ error: "missing MessageSid/MessageStatus" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await admin.rpc("mark_whatsapp_delivery", {
      p_provider_message_id: sid,
      p_status: status,
      p_error_code: errorCode,
      p_error_message: errorMessage,
    });

    if (error) {
      console.error("mark_whatsapp_delivery error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      await admin.from("app_events").insert({
        event_type: `whatsapp.callback.${status.toLowerCase()}`,
        entity_type: "whatsapp_logs",
        metadata: { sid, status, error_code: errorCode, error_message: errorMessage },
      });
    } catch (_) { /* swallow */ }

    // Twilio expects empty 200; XML response is also accepted.
    return new Response("", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("twilio-status-webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
