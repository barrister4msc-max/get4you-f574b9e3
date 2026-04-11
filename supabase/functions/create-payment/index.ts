import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Generate Allpay SHA256 signature.
 * Algorithm: sort all param keys alphabetically, collect non-empty string values
 * (for arrays — iterate items, sort their keys, collect values),
 * join with ":", append ":" + apiKey, then SHA-256 hex.
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
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Auth check ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user via JWT claims
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // ── 2. Parse request body ──
    const body = await req.json();
    const { task_id, proposal_id, amount, currency, item_name, success_url, cancel_url, lang } = body;

    if (!amount || !item_name) {
      return new Response(
        JSON.stringify({ error: "amount and item_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Load Allpay credentials from secrets ──
    const allpayLogin = Deno.env.get("ALLPAY_LOGIN")!;
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY")!;

    if (!allpayLogin || !allpayApiKey) {
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Generate unique order ID ──
    const orderId = crypto.randomUUID();

    // ── 5. Build webhook URL explicitly ──
    // This is the public URL of the allpay-webhook edge function
    const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/allpay-webhook`;

    console.log("Webhook URL:", webhookUrl);
    console.log("Order ID:", orderId);
    console.log("Amount:", amount, "Currency:", currency);

    // ── 6. Build Allpay API v11 request ──
    const allpayRequest: Record<string, unknown> = {
      login: allpayLogin,
      order_id: orderId,
      items: [
        {
          name: String(item_name),
          price: String(Number(amount).toFixed(2)),
          qty: "1",
          vat: "1",
        },
      ],
      currency: currency || "ILS",
      webhook_url: webhookUrl,
      expire: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour
    };

    if (lang) allpayRequest.lang = String(lang);
    if (success_url) allpayRequest.success_url = String(success_url);
    if (cancel_url) allpayRequest.cancel_url = String(cancel_url);

    console.log("[CREATE-PAYMENT] success_url:", success_url || "(not set)");
    console.log("[CREATE-PAYMENT] cancel_url:", cancel_url || "(not set)");

    // ── 7. Generate SHA-256 signature ──
    const sign = await getApiSignatureAsync(allpayRequest, allpayApiKey);
    allpayRequest.sign = sign;

    console.log("Allpay request (without sign):", JSON.stringify({ ...allpayRequest, sign: "[REDACTED]" }));

    // ── 8. Call Allpay API ──
    const allpayResponse = await fetch(
      "https://allpay.to/app/?show=getpayment&mode=api11",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allpayRequest),
      }
    );

    const allpayData = await allpayResponse.json();
    console.log("Allpay response:", JSON.stringify(allpayData));

    // ── 9. Determine the order_id Allpay will use in webhook ──
    // Allpay may return their own order_id or echo ours back.
    // The webhook will send order_id — we must store whatever Allpay uses.
    const allpayOrderId = allpayData.order_id ? String(allpayData.order_id) : orderId;
    console.log("[CREATE-PAYMENT] Our orderId:", orderId);
    console.log("[CREATE-PAYMENT] Allpay returned order_id:", allpayData.order_id);
    console.log("[CREATE-PAYMENT] Storing allpay_order_id as:", allpayOrderId);

    // ── 10. Insert order into DB using service role ──
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { error: insertError } = await serviceClient.from("orders").insert({
      user_id: userId,
      task_id: task_id || null,
      proposal_id: proposal_id || null,
      amount: Number(amount),
      currency: currency || "ILS",
      allpay_order_id: allpayOrderId,
      status: "pending",
      payment_url: allpayData.payment_url || null,
      allpay_response: allpayData,
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 10. Return result ──
    if (allpayData.error_code) {
      return new Response(
        JSON.stringify({
          error: allpayData.error_msg || "Payment creation failed",
          error_code: allpayData.error_code,
          order_id: orderId,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        order_id: allpayOrderId,
        payment_url: allpayData.payment_url,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-payment error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
