import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildWhatsappWebhookPayload } from "../_shared/whatsapp-payload.ts";

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
    // Dedicated ChatbotIsrael workflow webhook for "escrow_released" (Approved) notifications.
    const CHATBOTISRAEL_ESCROW_RELEASED_URL =
      Deno.env.get("CHATBOTISRAEL_ESCROW_RELEASED_WEBHOOK_URL") ||
      "https://ai.chatbotisrael.com/webhook/whatsapp-workflow/293200.421763.397501.1782556207";
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

    // Load webhook URLs from app_settings (priority) with ENV fallback.
    let SETTING_NEW_PROPOSAL_URL: string | null = null;
    let SETTING_ACCEPTED_URL: string | null = null;
    let SETTING_ESCROW_RELEASED_URL: string | null = null;
    let SETTING_WELCOME_URL: string | null = null;
    let SETTING_MATCHING_URL: string | null = null;
    try {
      const { data: settingsRows } = await admin
        .from("app_settings")
        .select("key, value")
        .in("key", [
          "proposal_created_webhook_url",
          "accepted_webhook_url",
          "work_approved_webhook_url",
          "chatbotisrael_webhook_url",
          "matching_task_webhook_url",
        ]);
      const unwrap = (v: unknown): string | null => {
        if (typeof v === "string") return v || null;
        if (v && typeof v === "object") {
          const s = (v as { value?: unknown }).value;
          if (typeof s === "string") return s || null;
        }
        return null;
      };
      for (const row of (settingsRows ?? []) as Array<{ key: string; value: unknown }>) {
        const url = unwrap(row.value);
        if (!url) continue;
        if (row.key === "proposal_created_webhook_url") SETTING_NEW_PROPOSAL_URL = url;
        else if (row.key === "accepted_webhook_url") SETTING_ACCEPTED_URL = url;
        else if (row.key === "work_approved_webhook_url") SETTING_ESCROW_RELEASED_URL = url;
        else if (row.key === "chatbotisrael_webhook_url") SETTING_WELCOME_URL = url;
        else if (row.key === "matching_task_webhook_url") SETTING_MATCHING_URL = url;
      }
    } catch (e) {
      console.error("app_settings load failed:", e);
    }
    const RESOLVED_WELCOME_URL = SETTING_WELCOME_URL || CHATBOTISRAEL_URL;
    const RESOLVED_NEW_PROPOSAL_URL = SETTING_NEW_PROPOSAL_URL || CHATBOTISRAEL_NEW_PROPOSAL_URL;
    const RESOLVED_ACCEPTED_URL = SETTING_ACCEPTED_URL || CHATBOTISRAEL_ACCEPTED_URL;
    const RESOLVED_ESCROW_RELEASED_URL = SETTING_ESCROW_RELEASED_URL || CHATBOTISRAEL_ESCROW_RELEASED_URL;
    // Matching-task webhook falls back to the default Welcome/ChatbotIsrael endpoint
    // when no dedicated URL is configured in app_settings.
    const RESOLVED_MATCHING_URL = SETTING_MATCHING_URL || CHATBOTISRAEL_URL;

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
        case "matching_task_published":
          return `🆕 A new task matching your profile is available on 4You: ${taskUrl}`;
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
          const isWelcome = row.event_type === "welcome";
          const isNewProposal = row.event_type === "new_proposal";
          const isAccepted = row.event_type === "tasker_hired";
          const isEscrowReleased = row.event_type === "escrow_released";
          const isMatching = row.event_type === "matching_task_published";
          const ACCOUNT_CREATED_EN =
            "Your 4You.AI account registration was completed successfully. " +
            "This message confirms that your account has been created. " +
            "You can now log in using the email address used during registration.";
          const outboundLang = isWelcome ? "en" : targetLang;
          const outboundMessage = isWelcome ? ACCOUNT_CREATED_EN : text;
          // Route per event_type: dedicated ChatbotIsrael workflow webhooks.
          const targetUrl = isNewProposal
            ? RESOLVED_NEW_PROPOSAL_URL
            : isAccepted
              ? RESOLVED_ACCEPTED_URL
              : isEscrowReleased
                ? RESOLVED_ESCROW_RELEASED_URL
                : isMatching
                  ? RESOLVED_MATCHING_URL
                  : isWelcome
                    ? RESOLVED_WELCOME_URL
                    : RESOLVED_WELCOME_URL;

          // Welcome-specific template metadata (kept as pre-builder tweaks
          // so the unified builder picks them up via row.metadata).
          if (isWelcome) {
            row.metadata = {
              ...(row.metadata || {}),
              template: "account_created",
              template_language: "en",
              final_message: ACCOUNT_CREATED_EN,
              original_language:
                (row.metadata as Record<string, unknown> | null)?.original_language ??
                targetLang,
            };
          }

          // SINGLE SOURCE OF TRUTH for every outbound WhatsApp webhook payload.
          // Base fields (phone, language, user_name, order_id, task_id, event,
          // event_type, workflow, source, provider, timestamp, metadata) are
          // always populated by the shared builder. Do not add per-workflow
          // payload assembly here.
          const { payload, outboundMeta } = await buildWhatsappWebhookPayload({
            admin,
            row,
            e164Phone: e164,
            language: outboundLang,
            message: outboundMessage,
            webhookUrl: targetUrl,
          });
          // Diagnostic: surface any empty template-safe fields before POST.
          try {
            const TEMPLATE_SAFE_KEYS = [
              "user_name", "order_id", "task_id", "task_title",
              "client_name", "tasker_name", "price", "budget",
              "currency", "city", "category_name", "message",
            ];
            const emptyFields = Object.entries(payload)
              .filter(([, v]) => v === null || v === undefined || (typeof v === "string" && v.trim() === ""))
              .map(([k]) => k);
            const emptyTemplateFields = emptyFields.filter((k) => TEMPLATE_SAFE_KEYS.includes(k));
            console.log("whatsapp.webhook.dispatch", JSON.stringify({
              workflow: (payload as { workflow?: unknown }).workflow,
              webhook_url: targetUrl,
              event_type: row.event_type,
              payload_keys: Object.keys(payload),
              empty_fields: emptyFields,
              empty_template_fields: emptyTemplateFields,
            }));
            // Safety net: if any template-safe field is still empty after the
            // builder normalization, patch with a hard fallback so ChatbotIsrael
            // never receives an empty text parameter (#131008).
            if (emptyTemplateFields.length > 0) {
              const HARD_FALLBACKS: Record<string, string> = {
                user_name: "User",
                order_id: "N/A",
                task_id: "N/A",
                task_title: "Task",
                client_name: "Client",
                tasker_name: "Tasker",
                price: "0",
                budget: "0",
                currency: "ILS",
                city: "Israel",
                category_name: "Service",
                message: "Update from Flow4You",
              };
              for (const k of emptyTemplateFields) {
                (payload as Record<string, unknown>)[k] = HARD_FALLBACKS[k] ?? "N/A";
              }
              console.warn("whatsapp.webhook.fallback_applied", JSON.stringify({
                event_type: row.event_type, fields: emptyTemplateFields,
              }));
            }
          } catch (_) { /* diagnostic must never break send */ }
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