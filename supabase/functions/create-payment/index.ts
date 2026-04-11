import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getApiSignature(params: Record<string, unknown>, apiKey: string): string {
  const sortedKeys = Object.keys(params).sort();
  const chunks: string[] = [];

  sortedKeys.forEach((key) => {
    if (key === "sign") return;
    const value = params[key];

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === "object" && item !== null) {
          const sortedItemKeys = Object.keys(item as Record<string, unknown>).sort();
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
  // Deno crypto
  const hashBuffer = new Uint8Array(
    // We'll use the sync approach below
  );

  // Use SubtleCrypto
  return signatureString; // placeholder, we'll use async version
}

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
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

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Parse body
    const body = await req.json();
    const { task_id, proposal_id, amount, currency, item_name, success_url, lang } = body;

    if (!amount || !item_name) {
      return new Response(
        JSON.stringify({ error: "amount and item_name are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const allpayLogin = Deno.env.get("ALLPAY_LOGIN")!;
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY")!;

    if (!allpayLogin || !allpayApiKey) {
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate unique order ID
    const orderId = crypto.randomUUID();

    // Build webhook URL
    const projectId = supabaseUrl.replace("https://", "").split(".")[0];
    const webhookUrl = `https://${projectId}.supabase.co/functions/v1/allpay-webhook`;

    // Build Allpay request (API v11)
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
      expire: String(Math.floor(Date.now() / 1000) + 3600),
    };

    if (lang) allpayRequest.lang = String(lang);
    if (success_url) allpayRequest.success_url = String(success_url);

    // Generate signature
    const sign = await getApiSignatureAsync(allpayRequest, allpayApiKey);
    allpayRequest.sign = sign;

    // Call Allpay API
    const allpayResponse = await fetch(
      "https://allpay.to/app/?show=getpayment&mode=api11",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allpayRequest),
      }
    );

    const allpayData = await allpayResponse.json();

    // Insert order into DB using service role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { error: insertError } = await serviceClient.from("orders").insert({
      id: orderId,
      user_id: userId,
      task_id: task_id || null,
      proposal_id: proposal_id || null,
      amount: Number(amount),
      currency: currency || "ILS",
      allpay_order_id: orderId,
      status: "pending",
      payment_url: allpayData.payment_url || null,
      allpay_response: allpayData,
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (allpayData.error_code) {
      return new Response(
        JSON.stringify({
          error: allpayData.error_msg || "Payment creation failed",
          order_id: orderId,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        order_id: orderId,
        payment_url: allpayData.payment_url,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("create-payment error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
