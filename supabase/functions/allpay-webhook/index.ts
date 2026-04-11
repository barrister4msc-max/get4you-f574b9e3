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
            if (typeof val === "string" && val.trim() !== "") {
              chunks.push(val);
            }
          }
        }
      }
    } else {
      if (typeof value === "string" && value.trim() !== "") {
        chunks.push(value);
      }
    }
  }

  const signatureString = chunks.join(":") + ":" + apiKey;
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  // Allpay sends POST; for anything else just return 200
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    // ── 1. Load API key ──
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY");
    if (!allpayApiKey) {
      console.error("ALLPAY_API_KEY not configured");
      return new Response("OK", { status: 200 });
    }

    // ── 2. Parse webhook body (JSON or form-encoded) ──
    let postData: Record<string, unknown>;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      postData = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      postData = {};
      formData.forEach((value, key) => {
        postData[key] = String(value);
      });
    } else {
      const text = await req.text();
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

    console.log("Webhook received:", JSON.stringify(postData));

    // ── 3. Extract fields ──
    const receivedSign = postData.sign as string;
    const orderId = postData.order_id as string;
    const status = postData.status;

    if (!orderId) {
      console.error("No order_id in webhook payload");
      return new Response("OK", { status: 200 });
    }

    // ── 4. Verify signature ──
    const calculatedSign = await getApiSignatureAsync(postData, allpayApiKey);

    if (receivedSign !== calculatedSign) {
      console.error(
        `Signature mismatch for order ${orderId}. Expected: ${calculatedSign}, Got: ${receivedSign}`
      );
      return new Response("OK", { status: 200 });
    }

    console.log(`Signature verified for order ${orderId}`);

    // ── 5. Update order in database ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Allpay: status === "1" means successful payment
    const newStatus = String(status) === "1" ? "paid" : "failed";

    const { error: updateError } = await serviceClient
      .from("orders")
      .update({
        status: newStatus,
        allpay_response: postData,
      })
      .eq("allpay_order_id", orderId);

    if (updateError) {
      console.error("Failed to update order:", updateError);
    } else {
      console.log(`Order ${orderId} updated to ${newStatus}`);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200 });
  }
});
