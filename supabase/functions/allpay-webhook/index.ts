import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

async function getApiSignatureAsync(
  params: Record<string, unknown>,
  apiKey: string
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const chunks: string[] = [];

  sortedKeys.forEach((key) => {
    if (key === "sign") return;
    const value = params[key];

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === "object" && item !== null) {
          const sortedItemKeys = Object.keys(
            item as Record<string, unknown>
          ).sort();
          sortedItemKeys.forEach((name) => {
            const val = (item as Record<string, unknown>)[name];
            if (typeof val === "string" && val.trim() !== "") {
              chunks.push(val);
            }
          });
        }
      });
    } else {
      if (typeof value === "string" && value.trim() !== "") {
        chunks.push(value);
      }
    }
  });

  const signatureString = chunks.join(":") + ":" + apiKey;
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  // Webhook is always POST from Allpay — always return 200
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY");
    if (!allpayApiKey) {
      console.error("ALLPAY_API_KEY not configured");
      return new Response("OK", { status: 200 });
    }

    // Parse webhook body (Allpay sends form-encoded or JSON)
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
      // Try JSON first, fallback to text
      const text = await req.text();
      try {
        postData = JSON.parse(text);
      } catch {
        // Try URL-encoded
        const params = new URLSearchParams(text);
        postData = {};
        params.forEach((value, key) => {
          postData[key] = value;
        });
      }
    }

    console.log("Webhook received:", JSON.stringify(postData));

    const receivedSign = postData.sign as string;
    const orderId = postData.order_id as string;
    const status = postData.status;

    if (!orderId) {
      console.error("No order_id in webhook");
      return new Response("OK", { status: 200 });
    }

    // Verify signature
    const calculatedSign = await getApiSignatureAsync(postData, allpayApiKey);

    if (receivedSign !== calculatedSign) {
      console.error(
        `Signature mismatch for order ${orderId}. Expected: ${calculatedSign}, Got: ${receivedSign}`
      );
      return new Response("OK", { status: 200 });
    }

    // Update order status
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // status === 1 or "1" means paid
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
