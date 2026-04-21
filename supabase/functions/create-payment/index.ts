import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Generate Allpay SHA256 signature.
 * Algorithm: sort all param keys alphabetically, collect non-empty string values
 * (for arrays — iterate items, sort their keys, collect values),
 * join with ":", append ":" + apiKey, then SHA-256 hex.
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ======================================================
    // 1. AUTH
    // ======================================================
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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // ======================================================
    // 2. INPUT
    // ======================================================
    const body = await req.json();
    const { task_id, proposal_id, success_url, cancel_url, lang, currency: requestedCurrency } = body;

    if (!proposal_id) {
      return new Response(JSON.stringify({ error: "proposal_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 3. LOAD PROPOSAL FROM DB (SOURCE OF TRUTH FOR PRICE)
    // ======================================================
    const { data: proposal, error: proposalError } = await serviceClient
      .from("proposals")
      .select("id, task_id, price, currency, user_id, status")
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional extra validation
    if (proposal.status && !["pending", "selected"].includes(proposal.status)) {
      return new Response(JSON.stringify({ error: "Proposal is not payable" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 4. LOAD TASK AND VERIFY OWNERSHIP
    // ======================================================
    const effectiveTaskId = task_id || proposal.task_id;

    const { data: task, error: taskError } = await serviceClient
      .from("tasks")
      .select("id, user_id, title, status, currency")
      .eq("id", effectiveTaskId)
      .single();

    if (taskError || !task) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (task.user_id !== userId) {
      return new Response(JSON.stringify({ error: "You do not own this task" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (proposal.task_id !== task.id) {
      return new Response(JSON.stringify({ error: "Proposal does not belong to this task" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional task status guard
    if (task.status && !["open", "awaiting_payment", "draft"].includes(task.status)) {
      console.log("[CREATE-PAYMENT] Task status warning:", task.status);
    }

    // ======================================================
    // 5. SAFE SERVER-SIDE VALUES
    // ======================================================
    const safeAmount = Number(proposal.price);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid proposal price" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeCurrency = proposal.currency || task.currency || requestedCurrency || "ILS";

    const safeItemName = task.title ? `Task: ${task.title}` : `Task payment #${task.id}`;

    // ======================================================
    // 6. LOAD ALLPAY CREDENTIALS
    // ======================================================
    const allpayLogin = Deno.env.get("ALLPAY_LOGIN")!;
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY")!;

    if (!allpayLogin || !allpayApiKey) {
      return new Response(JSON.stringify({ error: "Payment service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 7. GENERATE ORDER ID
    // ======================================================
    const orderId = crypto.randomUUID();

    // ======================================================
    // 8. WEBHOOK URL
    // ======================================================
    const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/allpay-webhook`;

    console.log("Webhook URL:", webhookUrl);
    console.log("Order ID:", orderId);
    console.log("Safe amount:", safeAmount, "Currency:", safeCurrency);

    // ======================================================
    // 9. BUILD ALLPAY REQUEST
    // ======================================================
    const allpayRequest: Record<string, unknown> = {
      login: allpayLogin,
      order_id: orderId,
      items: [
        {
          name: String(safeItemName),
          price: String(safeAmount.toFixed(2)),
          qty: "1",
          vat: "1",
        },
      ],
      currency: safeCurrency,
      webhook_url: webhookUrl,
      expire: String(Math.floor(Date.now() / 1000) + 3600),
    };

    if (lang) allpayRequest.lang = String(lang);

    if (success_url) {
      const sep = String(success_url).includes("?") ? "&" : "?";
      allpayRequest.success_url = `${String(success_url)}${sep}order_id=${encodeURIComponent(orderId)}`;
    }

    if (cancel_url) {
      allpayRequest.cancel_url = String(cancel_url);
    }

    console.log("[CREATE-PAYMENT] success_url:", success_url || "(not set)");
    console.log("[CREATE-PAYMENT] cancel_url:", cancel_url || "(not set)");

    // ======================================================
    // 10. SIGN REQUEST
    // ======================================================
    const sign = await getApiSignatureAsync(allpayRequest, allpayApiKey);
    allpayRequest.sign = sign;

    console.log("Allpay request (without sign):", JSON.stringify({ ...allpayRequest, sign: "[REDACTED]" }));

    // ======================================================
    // 11. CALL ALLPAY
    // ======================================================
    const allpayResponse = await fetch("https://allpay.to/app/?show=getpayment&mode=api11", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(allpayRequest),
    });

    const allpayData = await allpayResponse.json();
    console.log("Allpay response:", JSON.stringify(allpayData));

    // ======================================================
    // 12. SAVE ORDER IN DB
    // IMPORTANT: use safeAmount, not client amount
    // ======================================================
    const { data: insertResult, error: insertError } = await serviceClient
      .from("orders")
      .insert({
        user_id: userId,
        task_id: task.id,
        proposal_id: proposal.id,
        amount: safeAmount,
        currency: safeCurrency,
        allpay_order_id: orderId,
        status: "pending",
        payment_url: allpayData.payment_url || null,
        allpay_response: allpayData,
        title: safeItemName,
      })
      .select("id, allpay_order_id")
      .single();

    console.log("[CREATE-PAYMENT] DB insert result:", JSON.stringify(insertResult));

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 13. HANDLE ALLPAY ERROR
    // ======================================================
    if (allpayData.error_code) {
      return new Response(
        JSON.stringify({
          error: allpayData.error_msg || "Payment creation failed",
          error_code: allpayData.error_code,
          order_id: orderId,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ======================================================
    // 14. SUCCESS
    // ======================================================
    return new Response(
      JSON.stringify({
        order_id: orderId,
        payment_url: allpayData.payment_url,
        amount: safeAmount,
        currency: safeCurrency,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("create-payment error:", err);
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
