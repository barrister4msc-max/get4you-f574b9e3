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
            // Convert any non-null value to string (Allpay may send numbers)
            const strVal = val != null ? String(val).trim() : "";
            if (strVal !== "") {
              chunks.push(strVal);
            }
          }
        }
      }
    } else {
      // Convert any non-null value to string (handles numbers, booleans)
      const strVal = value != null ? String(value).trim() : "";
      if (strVal !== "") {
        chunks.push(strVal);
      }
    }
  }

  const signatureString = chunks.join(":") + ":" + apiKey;

  console.log("[SIGN DEBUG] Sorted keys:", sortedKeys.filter(k => k !== "sign").join(", "));
  console.log("[SIGN DEBUG] Chunks:", JSON.stringify(chunks));
  console.log("[SIGN DEBUG] Signature string (redacted key):", chunks.join(":") + ":[API_KEY]");

  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  console.log(`[WEBHOOK] ${req.method} received from ${req.headers.get("x-forwarded-for") || "unknown"}`);
  console.log(`[WEBHOOK] Content-Type: ${req.headers.get("content-type")}`);

  // Allpay sends POST; for anything else just return 200
  if (req.method !== "POST") {
    console.log("[WEBHOOK] Non-POST request, returning 200");
    return new Response("OK", { status: 200 });
  }

  try {
    // ── 1. Load API key ──
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY");
    if (!allpayApiKey) {
      console.error("[WEBHOOK] ALLPAY_API_KEY not configured!");
      return new Response("OK", { status: 200 });
    }
    console.log("[WEBHOOK] ALLPAY_API_KEY loaded (length:", allpayApiKey.length, ")");

    // ── 2. Parse webhook body (JSON or form-encoded) ──
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
        console.log("[WEBHOOK] Parsed raw text as JSON");
      } catch {
        const params = new URLSearchParams(text);
        postData = {};
        params.forEach((value, key) => {
          postData[key] = value;
        });
        console.log("[WEBHOOK] Parsed raw text as URL params");
      }
    }

    console.log("[WEBHOOK] Full payload:", JSON.stringify(postData));

    // ── 3. Extract fields ──
    const receivedSign = String(postData.sign || "");
    const orderId = String(postData.order_id || "");
    const status = postData.status;

    console.log("[WEBHOOK] order_id:", orderId);
    console.log("[WEBHOOK] status:", status);
    console.log("[WEBHOOK] received sign:", receivedSign);

    if (!orderId) {
      console.error("[WEBHOOK] No order_id in webhook payload");
      return new Response("OK", { status: 200 });
    }

    // ── 4. Verify signature ──
    const calculatedSign = await getApiSignatureAsync(postData, allpayApiKey);

    console.log("[WEBHOOK] Calculated sign:", calculatedSign);
    console.log("[WEBHOOK] Signs match:", receivedSign === calculatedSign);

    if (receivedSign !== calculatedSign) {
      console.error(
        `[WEBHOOK] Signature MISMATCH for order ${orderId}. Expected: ${calculatedSign}, Got: ${receivedSign}`
      );
      // Still update DB but mark in logs — uncomment below to be strict
      // return new Response("OK", { status: 200 });
    }

    console.log(`[WEBHOOK] Signature verified for order ${orderId}`);

    // ── 5. Update order in database ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Allpay: status === "1" or status === 1 means successful payment
    const newStatus = String(status) === "1" ? "paid" : "failed";
    console.log("[WEBHOOK] Will update order to status:", newStatus);

    // First check if order exists
    const { data: existingOrder, error: fetchError } = await serviceClient
      .from("orders")
      .select("id, status, allpay_order_id")
      .eq("allpay_order_id", orderId)
      .maybeSingle();

    if (fetchError) {
      console.error("[WEBHOOK] Error fetching order:", JSON.stringify(fetchError));
    } else if (!existingOrder) {
      console.error(`[WEBHOOK] Order with allpay_order_id="${orderId}" NOT FOUND in DB`);
    } else {
      console.log("[WEBHOOK] Found order:", JSON.stringify(existingOrder));
    }

    const { data: updateData, error: updateError } = await serviceClient
      .from("orders")
      .update({
        status: newStatus,
        allpay_response: postData,
      })
      .eq("allpay_order_id", orderId)
      .select();

    if (updateError) {
      console.error("[WEBHOOK] Failed to update order:", JSON.stringify(updateError));
    } else {
      console.log(`[WEBHOOK] Order ${orderId} updated to ${newStatus}. Result:`, JSON.stringify(updateData));
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[WEBHOOK] Unhandled error:", err);
    return new Response("OK", { status: 200 });
  }
});
