import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Allpay SHA256 signature validation helper.
 * Same algorithm as in create-payment:
 * - sort top-level keys alphabetically
 * - ignore "sign"
 * - collect non-empty string values
 * - for arrays of objects: sort item keys and collect non-empty string values
 * - join with ":" and append ":" + apiKey
 * - sha256 hex
 */
async function getApiSignatureAsync(params: Record<string, unknown>, apiKey: string): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const chunks: string[] = [];

  for (const key of sortedKeys) {
    if (key === "sign") continue;
    const value = params[key];

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          const itemKeys = Object.keys(item as Record<string, unknown>).sort();
          for (const name of itemKeys) {
            const val = (item as Record<string, unknown>)[name];
            if (typeof val === "string" && val.trim() !== "") {
              chunks.push(val);
            }
          }
        }
      }
    } else if (typeof value === "string" && value.trim() !== "") {
      chunks.push(value);
    }
  }

  const signatureString = chunks.join(":") + ":" + apiKey;
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

  if (["paid", "success", "successful", "completed", "approved"].includes(status)) return true;
  if (["success", "ok", "paid"].includes(result)) return true;
  if (["true", "1", "yes"].includes(success)) return true;

  // If provider explicitly says no error and paid status absent, keep false by default
  if (errorCode && errorCode !== "0") return false;

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

  if (["failed", "error", "cancelled", "canceled", "declined"].includes(status)) return true;
  if (["failed", "error", "cancelled", "canceled"].includes(result)) return true;
  if (errorCode && errorCode !== "0") return true;

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

    // save raw payload either way
    const { error: updateOrderError } = await serviceClient
      .from("orders")
      .update({
        status: nextOrderStatus,
        allpay_response: payload,
        provider: "allpay",
        provider_order_id: incomingOrderId,
        provider_status: providerStatus,
        provider_payment_id: providerPaymentId,
      })
      .eq("id", order.id);

    if (updateOrderError) {
      console.error("[ALLPAY-WEBHOOK] Order update error:", updateOrderError);
      return new Response(JSON.stringify({ error: "Failed to update order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If not paid, stop here safely
    if (!paid) {
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
    } // ======================================================
    // 4.1 CLEANUP DUPLICATE PENDING ORDERS
    // Cancel old pending orders for same task/proposal
    // now that this order is confirmed paid
    // ======================================================
    const { error: cancelDuplicateOrdersError } = await serviceClient
      .from("orders")
      .update({ status: "cancelled" })
      .eq("task_id", order.task_id)
      .eq("proposal_id", order.proposal_id)
      .eq("status", "pending")
      .neq("id", order.id);

    if (cancelDuplicateOrdersError) {
      console.error("[ALLPAY-WEBHOOK] Failed to cancel duplicate pending orders:", cancelDuplicateOrdersError);
      return new Response(JSON.stringify({ error: "Failed to cancel duplicate pending orders" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 5. LOAD TASK + PROPOSAL
    // ======================================================
    const { data: proposal, error: proposalError } = await serviceClient
      .from("proposals")
      .select("*")
      .eq("id", order.proposal_id)
      .maybeSingle();

    if (proposalError || !proposal) {
      console.error("[ALLPAY-WEBHOOK] Proposal load error:", proposalError);
      return new Response(JSON.stringify({ error: "Proposal not found for paid order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: task, error: taskError } = await serviceClient
      .from("tasks")
      .select("*")
      .eq("id", order.task_id)
      .maybeSingle();

    if (taskError || !task) {
      console.error("[ALLPAY-WEBHOOK] Task load error:", taskError);
      return new Response(JSON.stringify({ error: "Task not found for paid order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 6. ACCEPT SELECTED PROPOSAL
    // ======================================================
    if (proposal.status !== "accepted") {
      const { error: acceptProposalError } = await serviceClient
        .from("proposals")
        .update({ status: "accepted" })
        .eq("id", proposal.id);

      if (acceptProposalError) {
        console.error("[ALLPAY-WEBHOOK] Proposal accept error:", acceptProposalError);
        return new Response(JSON.stringify({ error: "Failed to accept proposal" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ======================================================
    // 7. REJECT OTHER PENDING PROPOSALS
    // ======================================================
    const { error: rejectOthersError } = await serviceClient
      .from("proposals")
      .update({ status: "rejected" })
      .eq("task_id", task.id)
      .neq("id", proposal.id)
      .eq("status", "pending");

    if (rejectOthersError) {
      console.error("[ALLPAY-WEBHOOK] Reject others error:", rejectOthersError);
      return new Response(JSON.stringify({ error: "Failed to reject other proposals" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 8. UPDATE TASK
    // ======================================================
    const { error: taskUpdateError } = await serviceClient
      .from("tasks")
      .update({
        status: "in_progress",
        assigned_to: proposal.user_id,
      })
      .eq("id", task.id);

    if (taskUpdateError) {
      console.error("[ALLPAY-WEBHOOK] Task update error:", taskUpdateError);
      return new Response(JSON.stringify({ error: "Failed to update task" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 8.5 CREATE TASK ASSIGNMENT IF NOT EXISTS (IDEMPOTENT)
    // Required for disputes flow which uses assignment_id.
    // ======================================================
    const commissionRate = 0.15;
    const orderAmount = Number(order.amount);
    const commissionAmount = Math.round(orderAmount * commissionRate * 100) / 100;
    const netAmount = Math.round((orderAmount - commissionAmount) * 100) / 100;
    const escrowCurrency = order.currency || proposal.currency || task.currency || "ILS";

    let assignmentId: string | null = order.assignment_id ?? null;

    if (!assignmentId) {
      const { data: existingAssignment, error: existingAssignmentError } = await serviceClient
        .from("task_assignments")
        .select("id")
        .eq("task_id", task.id)
        .maybeSingle();

      if (existingAssignmentError) {
        console.error("[ALLPAY-WEBHOOK] Assignment lookup error:", existingAssignmentError);
        return new Response(JSON.stringify({ error: "Failed to check assignment" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (existingAssignment) {
        assignmentId = existingAssignment.id;
      } else {
        const { data: newAssignment, error: assignmentInsertError } = await serviceClient
          .from("task_assignments")
          .insert({
            task_id: task.id,
            proposal_id: proposal.id,
            client_id: order.user_id,
            tasker_id: proposal.user_id,
            agreed_price: orderAmount,
            currency: escrowCurrency,
            commission_rate: commissionRate,
            commission_amount: commissionAmount,
            net_amount: netAmount,
            status: "in_progress",
            funded_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (assignmentInsertError || !newAssignment) {
          console.error("[ALLPAY-WEBHOOK] Assignment insert error:", assignmentInsertError);
          return new Response(JSON.stringify({ error: "Failed to create task assignment" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        assignmentId = newAssignment.id;
      }

      // Link order to assignment (best effort, do not fail webhook if it errors)
      const { error: linkOrderError } = await serviceClient
        .from("orders")
        .update({ assignment_id: assignmentId })
        .eq("id", order.id);

      if (linkOrderError) {
        console.error("[ALLPAY-WEBHOOK] Failed to link order to assignment:", linkOrderError);
      }
    }

    // ======================================================
    // 9. CREATE ESCROW IF NOT EXISTS (IDEMPOTENT)
    // Always link escrow to assignment_id for disputes.
    // ======================================================
    const { data: existingEscrow, error: existingEscrowError } = await serviceClient
      .from("escrow_transactions")
      .select("id, assignment_id")
      .eq("task_id", task.id)
      .eq("proposal_id", proposal.id)
      .maybeSingle();

    if (existingEscrowError) {
      console.error("[ALLPAY-WEBHOOK] Escrow lookup error:", existingEscrowError);
      return new Response(JSON.stringify({ error: "Failed to check escrow" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!existingEscrow) {
      const { error: escrowInsertError } = await serviceClient.from("escrow_transactions").insert({
        task_id: task.id,
        proposal_id: proposal.id,
        assignment_id: assignmentId,
        client_id: order.user_id,
        tasker_id: proposal.user_id,
        amount: orderAmount,
        currency: escrowCurrency,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        net_amount: netAmount,
        status: "held",
      });

      if (escrowInsertError) {
        console.error("[ALLPAY-WEBHOOK] Escrow insert error:", escrowInsertError);
        return new Response(JSON.stringify({ error: "Failed to create escrow" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (assignmentId && !existingEscrow.assignment_id) {
      // Backfill assignment_id on legacy escrow rows
      const { error: escrowLinkError } = await serviceClient
        .from("escrow_transactions")
        .update({ assignment_id: assignmentId })
        .eq("id", existingEscrow.id);

      if (escrowLinkError) {
        console.error("[ALLPAY-WEBHOOK] Failed to backfill escrow assignment_id:", escrowLinkError);
      }
    }

    // ======================================================
    // 10. OPTIONAL: fire-and-forget WhatsApp
    // If this fails, do NOT fail webhook processing
    // ======================================================
    try {
      const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
      const whatsappUrl = `https://${projectRef}.supabase.co/functions/v1/send-whatsapp`;

      await fetch(whatsappUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // function may rely on internal checks; if needed adapt later
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}`,
        },
        body: JSON.stringify({
          type: "tasker_hired",
          user_id: proposal.user_id,
          task_id: task.id,
        }),
      });
    } catch (whatsappError) {
      console.error("[ALLPAY-WEBHOOK] WhatsApp send failed:", whatsappError);
    }

    // ======================================================
    // 11. SUCCESS
    // ======================================================
    return new Response(
      JSON.stringify({
        success: true,
        order_id: incomingOrderId,
        order_status: "paid",
        task_id: task.id,
        proposal_id: proposal.id,
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
