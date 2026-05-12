import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getApiSignatureAsync } from "./signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePayloadValue(value: FormDataEntryValue | string | null) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return String(value);
}

async function parseIncomingPayload(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await req.json();
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const result: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      result[key] = normalizePayloadValue(value);
    }
    return result;
  }

  // fallback: try text -> urlencoded parser
  const raw = await req.text();
  try {
    return JSON.parse(raw);
  } catch {
    const params = new URLSearchParams(raw);
    const result: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) {
      result[key] = value;
    }
    return result;
  }
}

/**
 * Interpret Allpay status.
 * Adjust if your provider sends other exact values,
 * but these cover the common success/failure patterns.
 */
function isSuccessfulPayment(payload: Record<string, unknown>): boolean {
  const status = String(payload.status || payload.payment_status || payload.pay_status || "")
    .trim()
    .toLowerCase();

  const result = String(payload.result || "")
    .trim()
    .toLowerCase();

  const errorCode = String(payload.error_code || "")
    .trim()
    .toLowerCase();

  const success = String(payload.success || payload.is_paid || "")
    .trim()
    .toLowerCase();

  // Allpay sends status=1 for successful paid webhook
  if (["1", "paid", "success", "successful", "completed", "approved"].includes(status)) {
    return true;
  }

  if (["1", "success", "ok", "paid"].includes(result)) {
    return true;
  }

  if (["true", "1", "yes"].includes(success)) {
    return true;
  }

  if (errorCode && errorCode !== "0") {
    return false;
  }

  return false;
}

function isFailedPayment(payload: Record<string, unknown>): boolean {
  const status = String(payload.status || payload.payment_status || payload.pay_status || "")
    .trim()
    .toLowerCase();

  const result = String(payload.result || "")
    .trim()
    .toLowerCase();

  const errorCode = String(payload.error_code || "")
    .trim()
    .toLowerCase();

  // Allpay sends status=0 for failed payments
  if (["0", "failed", "error", "cancelled", "canceled", "declined"].includes(status)) {
    return true;
  }

  if (["0", "failed", "error", "cancelled", "canceled"].includes(result)) {
    return true;
  }

  if (errorCode && errorCode !== "0") {
    return true;
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !allpayApiKey) {
      return new Response(JSON.stringify({ error: "Server configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // ======================================================
    // 1. PARSE PAYLOAD
    // ======================================================
    const payload = await parseIncomingPayload(req);
    console.log("[ALLPAY-WEBHOOK] payload:", JSON.stringify(payload));
    await serviceClient.from("app_events").insert({
      event_type: "payment.webhook_received",
      entity_type: "order",
      metadata: {
        provider: "allpay",
        order_id: payload.order_id || payload.orderId || payload.invoice_id || null,
        status: payload.status || payload.payment_status || payload.pay_status || null,
      },
    });
    const incomingSign = String(payload.sign || "").trim();
    const incomingOrderId = String(payload.order_id || payload.orderId || payload.invoice_id || "").trim();

    if (!incomingOrderId) {
      return new Response(JSON.stringify({ error: "Missing order_id in webhook payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 2. VALIDATE SIGNATURE
    // ======================================================
    if (!incomingSign) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedSign = await getApiSignatureAsync(payload, allpayApiKey);

    if (expectedSign !== incomingSign) {
      console.error("[ALLPAY-WEBHOOK] Invalid signature", {
        expectedSign,
        incomingSign,
      });

      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 3. LOAD ORDER
    // ======================================================
    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .select("*")
      .eq("allpay_order_id", incomingOrderId)
      .maybeSingle();

    if (orderError) {
      console.error("[ALLPAY-WEBHOOK] Order lookup error:", orderError);
      return new Response(JSON.stringify({ error: "Order lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 3.1 VALIDATE WEBHOOK AMOUNT AGAINST ORDER AMOUNT
    // If provider sends amount/sum, it must match orders.amount.
    // If absent, log a warning but continue (signature is already valid).
    // ======================================================
    const rawAmount = payload.amount ?? payload.sum ?? payload.total ?? payload.price ?? null;
    if (rawAmount != null && String(rawAmount).trim() !== "") {
      const payloadAmount = Number(String(rawAmount).replace(",", "."));
      const orderAmount = Number(order.amount);
      if (!Number.isFinite(payloadAmount) || Math.abs(orderAmount - payloadAmount) > 0.01) {
        await serviceClient.from("app_events").insert({
          actor_id: order.user_id,
          event_type: "payment.webhook_amount_mismatch",
          entity_type: "order",
          entity_id: order.id,
          metadata: {
            provider: "allpay",
            provider_order_id: incomingOrderId,
            order_amount: orderAmount,
            payload_amount: payloadAmount,
          },
        });
        return new Response(JSON.stringify({ error: "Webhook amount does not match order amount" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("[ALLPAY-WEBHOOK] payload missing amount field; skipping amount check");
      await serviceClient.from("app_events").insert({
        actor_id: order.user_id,
        event_type: "payment.webhook_amount_missing",
        entity_type: "order",
        entity_id: order.id,
        metadata: { provider: "allpay", provider_order_id: incomingOrderId },
      });
    }
    if (order.status === "paid") {
      await serviceClient.from("app_events").insert({
        actor_id: order.user_id,
        event_type: "payment.webhook_duplicate_ignored",
        entity_type: "order",
        entity_id: order.id,
        metadata: {
          provider: "allpay",
          provider_order_id: incomingOrderId,
          current_status: order.status,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          order_id: incomingOrderId,
          status: "paid",
          duplicate: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    // ======================================================
    // 4. DETERMINE PAYMENT OUTCOME
    // ======================================================
    const paid = isSuccessfulPayment(payload);
    const failed = isFailedPayment(payload);

    let nextOrderStatus = order.status;

    if (paid) nextOrderStatus = "paid";
    else if (failed) nextOrderStatus = "failed";
    else nextOrderStatus = order.status || "pending";
    const providerStatus =
      String(payload.status || payload.payment_status || payload.pay_status || nextOrderStatus || "").trim() || null;

    const providerPaymentId =
      String(payload.payment_id || payload.transaction_id || payload.txn_id || "").trim() || null;

    // ======================================================
    // 4.1 IF NOT PAID — SAVE STATUS AND STOP
    // ======================================================
    if (!paid) {
      const { error: updateOrderError } = await serviceClient
        .from("orders")
        .update({
          status: nextOrderStatus,
          allpay_response: payload,
          provider: "allpay",
          provider_order_id: incomingOrderId,
          provider_status: providerStatus,
          provider_payment_id: providerPaymentId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateOrderError) {
        console.error("[ALLPAY-WEBHOOK] Order update error:", updateOrderError);

        return new Response(JSON.stringify({ error: "Failed to update order" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await serviceClient.from("app_events").insert({
        actor_id: order.user_id,
        event_type: failed ? "payment.webhook_failed" : "payment.webhook_not_paid",
        entity_type: "order",
        entity_id: order.id,
        metadata: {
          provider: "allpay",
          provider_order_id: incomingOrderId,
          provider_status: providerStatus,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          order_id: incomingOrderId,
          status: nextOrderStatus,
          message: "Webhook processed (not paid state)",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ======================================================
    // 5. FINALIZE PAID ORDER VIA RPC
    // ======================================================
    const { data: finalizeResult, error: finalizeError } = await serviceClient.rpc("finalize_paid_order", {
      p_order_id: order.id,
      p_provider_payment_id: providerPaymentId,
      p_provider_status: providerStatus,
    });

    if (finalizeError) {
      console.error("[ALLPAY-WEBHOOK] finalize_paid_order failed:", finalizeError);

      await serviceClient.from("app_events").insert({
        actor_id: order.user_id,
        event_type: "payment.finalize_failed",
        entity_type: "order",
        entity_id: order.id,
        metadata: {
          provider: "allpay",
          provider_order_id: incomingOrderId,
          error: finalizeError.message,
        },
      });

      return new Response(JSON.stringify({ error: "Finalize failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // save provider payload after successful finalize
    await serviceClient
      .from("orders")
      .update({
        allpay_response: payload,
        provider: "allpay",
        provider_order_id: incomingOrderId,
        provider_status: providerStatus,
        provider_payment_id: providerPaymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    const finalizedTaskId = finalizeResult?.task_id || order.task_id;
    const finalizedProposalId = finalizeResult?.proposal_id || order.proposal_id;

    const { data: finalizedProposal } = await serviceClient
      .from("proposals")
      .select("id, user_id")
      .eq("id", finalizedProposalId)
      .maybeSingle();

    // ======================================================
    // 10. OPTIONAL: fire-and-forget WhatsApp
    // If this fails, do NOT fail webhook processing
    // ======================================================
    try {
      const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
      const whatsappUrl = `https://${projectRef}.supabase.co/functions/v1/send-whatsapp`;

      const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
      if (!internalSecret) {
        console.warn("[ALLPAY-WEBHOOK] INTERNAL_FUNCTION_SECRET missing; skipping WhatsApp notify");
      } else {
        await fetch(whatsappUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": internalSecret,
          },
          body: JSON.stringify({
            type: "tasker_hired",
            user_id: finalizedProposal?.user_id,
            task_id: finalizedTaskId,
          }),
        });
      }
    } catch (whatsappError) {
      console.error("[ALLPAY-WEBHOOK] WhatsApp send failed:", whatsappError);
    }

    // ======================================================
    // 11. SUCCESS
    // ======================================================
    await serviceClient.from("app_events").insert({
      actor_id: order.user_id,
      event_type: "payment.webhook_paid",
      entity_type: "order",
      entity_id: order.id,
      metadata: {
        provider: "allpay",
        provider_order_id: incomingOrderId,
        task_id: finalizedTaskId,
        proposal_id: finalizedProposalId,
        amount: order.amount,
        currency: order.currency,
      },
    });
    return new Response(
      JSON.stringify({
        success: true,
        order_id: incomingOrderId,
        order_status: "paid",
        task_id: finalizedTaskId,
        proposal_id: finalizedProposalId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[ALLPAY-WEBHOOK] Unexpected error:", err);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (supabaseUrl && serviceRoleKey) {
        const serviceClient = createClient(supabaseUrl, serviceRoleKey);
        await serviceClient.from("app_events").insert({
          event_type: "payment.webhook_unexpected_error",
          entity_type: "order",
          metadata: {
            error: err instanceof Error ? err.message : "Internal server error",
          },
        });
      }
    } catch {
      // ignore logging errors
    }
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
