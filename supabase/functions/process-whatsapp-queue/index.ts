import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function normalizeE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.startsWith("whatsapp:") ? input.slice("whatsapp:".length) : input;
  const hasPlus = raw.trim().startsWith("+");
  let digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  // Israel
  let local: string | null = null;
  if ((hasPlus && digits.startsWith("972")) || digits.startsWith("972")) local = digits.slice(3);
  else if (digits.startsWith("0")) local = digits.slice(1);
  else if (digits.length === 9 && digits.startsWith("5")) local = digits;
  if (local) {
    if (/^5\d{8}$/.test(local) || /^[23489]\d{7}$/.test(local)) return `+972${local}`;
  }
  // Cyprus
  let cy: string | null = null;
  if ((hasPlus && digits.startsWith("357")) || digits.startsWith("357")) cy = digits.slice(3);
  else if (digits.length === 8) cy = digits;
  if (cy && /^[29]\d{7}$/.test(cy)) return `+357${cy}`;
  return null;
}

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
    const isInternal = !!INTERNAL_SECRET && safeEqual(incoming, INTERNAL_SECRET);
    let isServiceRole = false;
    if (!isInternal && auth.startsWith("Bearer ")) {
      try {
        const token = auth.slice("Bearer ".length);
        const payloadB64 = token.split(".")[1] ?? "";
        const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
        const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
        const claims = JSON.parse(json);
        if (claims?.role === "service_role") isServiceRole = true;
      } catch (_) { /* ignore */ }
    }
    if (!isInternal && !isServiceRole) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    // Twilio Sandbox WhatsApp default sender; override via TWILIO_WHATSAPP_FROM env.
    // Normalize: ensure the WhatsApp channel prefix is present (Twilio rejects mixed channels).
    const RAW_TWILIO_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
    const TWILIO_FROM = RAW_TWILIO_FROM.startsWith("whatsapp:")
      ? RAW_TWILIO_FROM
      : `whatsapp:${RAW_TWILIO_FROM}`;
    const WHATSAPP_PROVIDER = (Deno.env.get("WHATSAPP_PROVIDER") || "chatbotisrael").toLowerCase();
    const CHATBOTISRAEL_URL = Deno.env.get("CHATBOTISRAEL_WHATSAPP_WEBHOOK_URL") || "";
    // Dedicated ChatbotIsrael workflow webhook for "new_proposal" notifications.
    // Falls back to the default CHATBOTISRAEL_URL if not configured.
    const CHATBOTISRAEL_NEW_PROPOSAL_URL =
      Deno.env.get("CHATBOTISRAEL_NEW_PROPOSAL_WEBHOOK_URL") ||
      "https://ai.chatbotisrael.com/webhook/whatsapp-workflow/293200.421763.397494.1782504370";
    // Dedicated ChatbotIsrael workflow webhook for "tasker_hired" (Accepted) notifications.
    const CHATBOTISRAEL_ACCEPTED_URL =
      Deno.env.get("CHATBOTISRAEL_ACCEPTED_WEBHOOK_URL") ||
      "https://ai.chatbotisrael.com/webhook/whatsapp-workflow/293200.421763.397497.1782555008";
    if (WHATSAPP_PROVIDER === "twilio" && (!LOVABLE_API_KEY || !TWILIO_API_KEY)) {
      return new Response(
        JSON.stringify({ error: "Twilio env not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (WHATSAPP_PROVIDER === "chatbotisrael" && !CHATBOTISRAEL_URL) {
      return new Response(
        JSON.stringify({ error: "CHATBOTISRAEL_WHATSAPP_WEBHOOK_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://4you.ai";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const STATUS_CALLBACK_URL = `${SUPABASE_URL}/functions/v1/twilio-status-webhook`;

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
      let targetLang = "en";
      if (!targetPhone && row.target_user_id) {
        const { data: prof } = await admin
          .from("profiles")
          .select("phone, preferred_language")
          .eq("user_id", row.target_user_id)
          .maybeSingle();
        targetPhone = prof?.phone ?? null;
        targetLang = (prof?.preferred_language as string) || "en";
      } else if (row.target_user_id) {
        const { data: prof } = await admin
          .from("profiles")
          .select("preferred_language")
          .eq("user_id", row.target_user_id)
          .maybeSingle();
        targetLang = (prof?.preferred_language as string) || "en";
      }
      if (!targetPhone) {
        await admin.rpc("mark_whatsapp_failed", { p_log_id: row.id, p_error_message: "no phone" });
        await audit("failed", row, { error: "no phone" });
        return { id: row.id, ok: false, error: "no phone" };
      }
      const e164 = normalizeE164(targetPhone);
      if (!e164) {
        await admin.rpc("mark_whatsapp_failed", { p_log_id: row.id, p_error_message: "invalid_phone" });
        await audit("failed", row, { error: "invalid_phone", raw: targetPhone });
        return { id: row.id, ok: false, error: "invalid_phone" };
      }
      // Persist normalized phone back to the log for auditability.
      await admin.from("whatsapp_logs").update({ phone: e164 }).eq("id", row.id);
      const to = `whatsapp:${e164}`;
      const text = buildText(row);

      // ===== ChatbotIsrael provider (primary) =====
      if (WHATSAPP_PROVIDER === "chatbotisrael") {
        try {
          const meta = (row.metadata || {}) as Record<string, unknown>;
          // Welcome event uses the approved English template `account_created`.
          // Other events keep their existing localized free-form text.
          const isWelcome = row.event_type === "welcome";
          const isNewProposal = row.event_type === "new_proposal";
          const isAccepted = row.event_type === "tasker_hired";
          const ACCOUNT_CREATED_EN =
            "Your 4You.AI account registration was completed successfully. " +
            "This message confirms that your account has been created. " +
            "You can now log in using the email address used during registration.";
          const outboundLang = isWelcome ? "en" : targetLang;
          const outboundMessage = isWelcome ? ACCOUNT_CREATED_EN : text;
          const outboundMeta: Record<string, unknown> = { ...meta };
          if (isWelcome) {
            outboundMeta.template = "account_created";
            outboundMeta.template_language = "en";
            outboundMeta.final_message = ACCOUNT_CREATED_EN;
            if (!outboundMeta.original_language) {
              outboundMeta.original_language = targetLang;
            }
          }
          const payload: Record<string, unknown> = {
            phone: e164,
            event_type: row.event_type,
            language: outboundLang,
            target_user_id: row.target_user_id,
            task_id: row.task_id,
            proposal_id: (meta.proposal_id as string) ?? null,
            message: outboundMessage,
            metadata: outboundMeta,
          };
          if (isWelcome) payload.template = "account_created";
          // Route per event_type: dedicated ChatbotIsrael workflow webhooks.
          const targetUrl = isNewProposal
            ? CHATBOTISRAEL_NEW_PROPOSAL_URL
            : isAccepted
              ? CHATBOTISRAEL_ACCEPTED_URL
              : CHATBOTISRAEL_URL;
          if (isNewProposal) {
            outboundMeta.workflow = "new_proposal";
            outboundMeta.webhook_url = targetUrl;
          }
          if (isAccepted) {
            outboundMeta.workflow = "accepted";
            outboundMeta.webhook_url = targetUrl;
            payload.workflow = "accepted";
            payload.event = "tasker_hired";
            payload.task_title = (meta.task_title as string) ?? null;
            payload.client_name = (meta.client_name as string) ?? null;
            payload.tasker_name = (meta.tasker_name as string) ?? null;
            payload.price = (meta.price as number | string | null) ?? null;
            payload.currency = (meta.currency as string) ?? null;
            payload.source = (meta.source as string) ?? "flow4you";
            if (typeof payload.message !== "string" || !payload.message) {
              payload.message = "Your offer was accepted.";
            }
          }
          const resp = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const bodyText = await resp.text().catch(() => "");
          if (!resp.ok) {
            const err = `ChatbotIsrael ${resp.status}: ${bodyText.slice(0, 500)}`;
            await admin.rpc("mark_whatsapp_failed", { p_log_id: row.id, p_error_message: err });
            await audit(row.retry_count + 1 >= 5 ? "failed" : "retry", row, { error: err, status: resp.status, provider: "chatbotisrael" });
            return { id: row.id, ok: false, error: err };
          }
          await admin.rpc("mark_whatsapp_sent", { p_log_id: row.id, p_provider_message_id: null });
          await admin
            .from("whatsapp_logs")
            .update({ provider: "chatbotisrael", metadata: outboundMeta })
            .eq("id", row.id);
          await audit("sent", row, { provider: "chatbotisrael", response: bodyText.slice(0, 200) });
          return { id: row.id, ok: true };
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          await admin.rpc("mark_whatsapp_failed", { p_log_id: row.id, p_error_message: err });
          await audit(row.retry_count + 1 >= 5 ? "failed" : "retry", row, { error: err, provider: "chatbotisrael" });
          return { id: row.id, ok: false, error: err };
        }
      }

      // ===== Twilio fallback =====

      try {
        const resp = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TWILIO_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: to,
            From: TWILIO_FROM,
            Body: text,
            StatusCallback: STATUS_CALLBACK_URL,
          }),
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