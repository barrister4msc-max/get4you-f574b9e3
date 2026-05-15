import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const incoming = req.headers.get("x-internal-secret") ?? "";
    const auth = req.headers.get("Authorization") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isInternal = !!INTERNAL_SECRET && safeEqual(incoming, INTERNAL_SECRET);
    const isServiceRole =
      !!SERVICE_ROLE && auth === `Bearer ${SERVICE_ROLE}`;
    if (!isInternal && !isServiceRole) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const TWILIO_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_FROM) {
      return new Response(
        JSON.stringify({ error: "Twilio env not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://4you.ai";

    let limit = 20;
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 100) {
          limit = body.limit;
        }
      }
    } catch (_) { /* ignore */ }

    const { data: claimed, error: claimErr } = await admin.rpc(
      "claim_pending_whatsapp_messages",
      { p_limit: limit },
    );
    if (claimErr) {
      console.error("claim error:", claimErr);
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (claimed ?? []) as Array<{
      id: string;
      phone: string | null;
      target_user_id: string | null;
      event_type: string;
      task_id: string | null;
      retry_count: number;
      metadata: Record<string, unknown>;
    }>;

    const audit = async (kind: "sent" | "failed" | "retry", row: typeof rows[number], extra: Record<string, unknown>) => {
      try {
        await admin.from("app_events").insert({
          event_type: `whatsapp.${kind}`,
          entity_type: "whatsapp_logs",
          entity_id: row.id,
          metadata: {
            phone: row.phone,
            event: row.event_type,
            task_id: row.task_id,
            retry_count: row.retry_count,
            ...extra,
          },
        });
      } catch (_) { /* swallow */ }
    };

    const buildText = (row: typeof rows[number]): string => {
      const meta = row.metadata || {};
      if (typeof (meta as { message?: unknown }).message === "string") {
        return (meta as { message: string }).message;
      }
      const taskUrl = row.task_id ? `${APP_BASE_URL}/tasks/${row.task_id}` : APP_BASE_URL;
      switch (row.event_type) {
        case "tasker_hired":
          return `🎉 You've been selected for a task! View details: ${taskUrl}`;
        case "new_proposal":
          return `📩 New proposal on your task! View: ${taskUrl}`;
        case "task_completed":
          return `✅ Task completed on 4You. View: ${taskUrl}`;
        default:
          return `Update from 4You: ${taskUrl}`;
      }
    };

    const sendOne = async (row: typeof rows[number]) => {
      let targetPhone = row.phone;
      if (!targetPhone && row.target_user_id) {
        const { data: prof } = await admin
          .from("profiles")
          .select("phone")
          .eq("user_id", row.target_user_id)
          .maybeSingle();
        targetPhone = prof?.phone ?? null;
      }
      if (!targetPhone) {
        await admin.rpc("mark_whatsapp_failed", { p_log_id: row.id, p_error_message: "no phone" });
        await audit("failed", row, { error: "no phone" });
        return { id: row.id, ok: false, error: "no phone" };
      }
      const to = targetPhone.startsWith("whatsapp:") ? targetPhone : `whatsapp:${targetPhone}`;
      const text = buildText(row);

      try {
        const resp = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TWILIO_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: text }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          const err = `Twilio ${resp.status}: ${JSON.stringify(data)}`;
          await admin.rpc("mark_whatsapp_failed", { p_log_id: row.id, p_error_message: err });
          await audit(row.retry_count + 1 >= 5 ? "failed" : "retry", row, { error: err, status: resp.status });
          return { id: row.id, ok: false, error: err };
        }
        const sid = (data as { sid?: string }).sid ?? null;
        await admin.rpc("mark_whatsapp_sent", { p_log_id: row.id, p_provider_message_id: sid });
        await audit("sent", row, { sid });
        return { id: row.id, ok: true, sid };
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await admin.rpc("mark_whatsapp_failed", { p_log_id: row.id, p_error_message: err });
        await audit(row.retry_count + 1 >= 5 ? "failed" : "retry", row, { error: err });
        return { id: row.id, ok: false, error: err };
      }
    };

    const results = [];
    for (const row of rows) {
      results.push(await sendOne(row));
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("queue worker error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});