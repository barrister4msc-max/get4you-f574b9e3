import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Allpay Webhook Handler
 *
 * Called by Allpay when a payment status changes.
 * - Verifies SHA-256 signature using ALLPAY_API_KEY
 * - Updates the order status to "paid" (status=1) or "failed"
 * - Always returns HTTP 200 (Allpay requirement)
 */

async function getApiSignatureAsync(
  params: Record<string, unknown>,
  apiKey: string
): Promise<string> {
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
            const strVal = val != null ? String(val).trim() : "";
            if (strVal !== "") {
              chunks.push(strVal);
            }
          }
        }
      }
    } else {
      const strVal = value != null ? String(value).trim() : "";
      if (strVal !== "") {
        chunks.push(strVal);
      }
    }
  }

  const signatureString = chunks.join(":") + ":" + apiKey;

  console.log("[SIGN] Sorted keys:", sortedKeys.filter(k => k !== "sign").join(", "));
  console.log("[SIGN] Chunks:", JSON.stringify(chunks));
  console.log("[SIGN] Signature string (key redacted):", chunks.join(":") + ":[KEY]");

  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  console.log(`[WEBHOOK] ${req.method} from ${req.headers.get("x-forwarded-for") || "unknown"}`);
  console.log(`[WEBHOOK] Content-Type: ${req.headers.get("content-type")}`);

  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    // ── 1. Load API key ──
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY");
    if (!allpayApiKey) {
      console.error("[WEBHOOK] ALLPAY_API_KEY not configured!");
      return new Response("OK", { status: 200 });
    }

    // ── 2. Parse webhook body ──
    let postData: Record<string, unknown>;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      postData = await req.json();
      console.log("[WEBHOOK] Parsed as JSON");
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      postData = {};
      formData.forEach((value, key) => {
        postData[key] = String(value);
      });
      console.log("[WEBHOOK] Parsed as form-urlencoded");
    } else {
      const text = await req.text();
      console.log("[WEBHOOK] Raw body:", text.substring(0, 500));
      try {
        postData = JSON.parse(text);
      } catch {
        const params = new URLSearchParams(text);
        postData = {};
        params.forEach((value, key) => {
          postData[key] = value;
        });
      }
    }

    console.log("[WEBHOOK] Full payload:", JSON.stringify(postData));

    // ── 3. Extract fields ──
    const receivedSign = String(postData.sign || "");
    const orderId = String(postData.order_id || "");
    const status = postData.status;

    console.log("[WEBHOOK] order_id:", orderId);
    console.log("[WEBHOOK] status:", String(status));
    console.log("[WEBHOOK] received sign:", receivedSign);

    if (!orderId) {
      console.error("[WEBHOOK] No order_id in payload");
      return new Response("OK", { status: 200 });
    }

    // ── 4. Verify signature (strict) ──
    const calculatedSign = await getApiSignatureAsync(postData, allpayApiKey);

    console.log("[WEBHOOK] Calculated sign:", calculatedSign);
    console.log("[WEBHOOK] Match:", receivedSign === calculatedSign);

    if (receivedSign !== calculatedSign) {
      console.error(`[WEBHOOK] SIGNATURE MISMATCH for ${orderId}. Expected: ${calculatedSign}, Got: ${receivedSign}`);
      return new Response("OK", { status: 200 });
    }

    console.log(`[WEBHOOK] ✅ Signature verified for ${orderId}`);

    // ── 5. Update order in database ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Allpay status mapping
    const statusStr = String(status).toLowerCase().trim();
    const successStatuses = ["1", "success", "approved"];
    const failureStatuses = ["0", "failed", "declined"];

    let newStatus: string;
    if (successStatuses.includes(statusStr)) {
      newStatus = "paid";
    } else if (failureStatuses.includes(statusStr)) {
      newStatus = "failed";
    } else {
      console.warn(`[WEBHOOK] ⚠️ UNKNOWN status "${status}" for order ${orderId} — ignoring`);
      return new Response("OK", { status: 200 });
    }

    console.log("[WEBHOOK] Raw status value:", status, "| Type:", typeof status);
    console.log("[WEBHOOK] Normalized:", statusStr, "| → newStatus:", newStatus);

    // Check if order exists
    const { data: existingOrder, error: fetchError } = await serviceClient
      .from("orders")
      .select("id, status, allpay_order_id, amount, currency, proposal_id, task_id, user_id")
      .eq("allpay_order_id", orderId)
      .maybeSingle();

    if (fetchError) {
      console.error("[WEBHOOK] DB fetch error:", JSON.stringify(fetchError));
      return new Response("OK", { status: 200 });
    }

    if (!existingOrder) {
      console.error(`[WEBHOOK] Order "${orderId}" NOT FOUND in orders table`);
      return new Response("OK", { status: 200 });
    }

    console.log("[WEBHOOK] Found order:", JSON.stringify(existingOrder));

    // ── Security: skip if already paid (duplicate webhook) ──
    if (existingOrder.status === "paid") {
      console.log(`[WEBHOOK] Order ${orderId} already paid — ignoring duplicate webhook`);
      return new Response("OK", { status: 200 });
    }

    // ── Security: validate amount matches ──
    const webhookAmount = postData.amount != null ? Number(postData.amount) : null;
    if (webhookAmount != null && existingOrder.amount != null) {
      const dbAmount = Number(existingOrder.amount);
      if (Math.abs(webhookAmount - dbAmount) > 0.01) {
        console.error(`[WEBHOOK] AMOUNT MISMATCH for ${orderId}. DB: ${dbAmount}, Webhook: ${webhookAmount}`);
        return new Response("OK", { status: 200 });
      }
      console.log(`[WEBHOOK] Amount verified: ${webhookAmount}`);
    } else {
      console.log("[WEBHOOK] Amount not in webhook payload — skipping amount check");
    }

    // Update the order
    const { data: updateResult, error: updateError } = await serviceClient
      .from("orders")
      .update({
        status: newStatus,
        allpay_response: postData,
        updated_at: new Date().toISOString(),
      })
      .eq("allpay_order_id", orderId)
      .neq("status", "paid")  // extra guard against race conditions
      .select("id, status");

    if (updateError) {
      console.error("[WEBHOOK] DB update error:", JSON.stringify(updateError));
    } else if (!updateResult?.length) {
      console.log(`[WEBHOOK] No rows updated for ${orderId} — likely already paid (race condition)`);
    } else {
      console.log(`[WEBHOOK] ✅ Order ${orderId} → ${newStatus}. Result:`, JSON.stringify(updateResult));

      // ── Notify tasker on successful payment ──
      if (newStatus === "paid" && existingOrder.proposal_id) {
        try {
          // Get proposal to find tasker_id, and task for title
          const { data: proposal } = await serviceClient
            .from("proposals")
            .select("user_id, task_id")
            .eq("id", existingOrder.proposal_id)
            .single();

          if (proposal) {
            const { data: task } = await serviceClient
              .from("tasks")
              .select("title")
              .eq("id", proposal.task_id)
              .single();

            await serviceClient.from("notifications").insert({
              user_id: proposal.user_id,
              type: "payment_received",
              title: `Payment received for "${task?.title || "task"}"`,
              message: `Client paid ${existingOrder.amount} ${existingOrder.currency}. You can start working!`,
              task_id: proposal.task_id,
              proposal_id: existingOrder.proposal_id,
            });
            console.log(`[WEBHOOK] ✅ Notification sent to tasker ${proposal.user_id}`);

            // Send transactional email to tasker
            const { data: taskerProfile } = await serviceClient
              .from("profiles")
              .select("email, display_name")
              .eq("user_id", proposal.user_id)
              .single();

            if (taskerProfile?.email) {
              await serviceClient.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "payment-received",
                  recipientEmail: taskerProfile.email,
                  idempotencyKey: `payment-received-${existingOrder.id}`,
                  templateData: {
                    taskerName: taskerProfile.display_name || undefined,
                    taskTitle: task?.title || undefined,
                    amount: String(existingOrder.amount),
                    currency: existingOrder.currency || "USD",
                  },
                },
              });
              console.log(`[WEBHOOK] ✅ Payment email sent to ${taskerProfile.email}`);
            }
          }
        } catch (notifErr) {
          console.error("[WEBHOOK] Failed to send tasker notification:", notifErr);
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[WEBHOOK] Unhandled error:", err);
    return new Response("OK", { status: 200 });
  }
});
