import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Supabase environment is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // ======================================================
    // 2. INPUT
    // IMPORTANT: do NOT trust amount/item_name from client
    // ======================================================
    const body = await req.json();
    const {
      task_id,
      proposal_id,
      success_url,
      cancel_url,
      lang,
      currency: requestedCurrency,
      assignment_id, // optional for future use
    } = body ?? {};

    if (!proposal_id) {
      return new Response(JSON.stringify({ error: "proposal_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 3. LOAD PROPOSAL (SOURCE OF TRUTH FOR PRICE)
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

    if (proposal.status && !["pending", "selected"].includes(String(proposal.status))) {
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

    // Optional: guard task status
    if (task.status && !["draft", "open", "awaiting_payment"].includes(String(task.status))) {
      console.log("[CREATE-PAYMENT] Task status warning:", task.status);
    }

    // ======================================================
    // 5. SERVER-SIDE SAFE VALUES
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
    // BLOCK DUPLICATE ORDERS
    // ======================================================
    const { data: existingPaidOrder } = await serviceClient
      .from("orders")
      .select("id, status, allpay_order_id")
      .eq("task_id", task.id)
      .eq("proposal_id", proposal.id)
      .eq("status", "paid")
      .maybeSingle();

    if (existingPaidOrder) {
      return new Response(
        JSON.stringify({
          error: "This proposal has already been paid",
          order_id: existingPaidOrder.id,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: existingPendingOrder } = await serviceClient
      .from("orders")
      .select("id, status, payment_url, allpay_order_id")
      .eq("task_id", task.id)
      .eq("proposal_id", proposal.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPendingOrder?.payment_url) {
      return new Response(
        JSON.stringify({
          success: true,
          order_id: existingPendingOrder.allpay_order_id || existingPendingOrder.id,
          payment_url: existingPendingOrder.payment_url,
          reused: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    // ======================================================
    // 6. LOAD ALLPAY CREDENTIALS
    // ======================================================
    const allpayLogin = Deno.env.get("ALLPAY_LOGIN");
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY");

    if (!allpayLogin || !allpayApiKey) {
      return new Response(JSON.stringify({ error: "Payment service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 7. GENERATE INTERNAL ORDER ID
    // IMPORTANT: this is the value we bind to our DB record
    // ======================================================
    const orderId = crypto.randomUUID();

    // ======================================================
    // 8. BUILD WEBHOOK URL
    // ======================================================
    const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/allpay-webhook`;

    console.log("[CREATE-PAYMENT] userId:", userId);
    console.log("[CREATE-PAYMENT] taskId:", task.id);
    console.log("[CREATE-PAYMENT] proposalId:", proposal.id);
    console.log("[CREATE-PAYMENT] assignmentId:", assignment_id ?? null);
    console.log("[CREATE-PAYMENT] orderId:", orderId);
    console.log("[CREATE-PAYMENT] safeAmount:", safeAmount);
    console.log("[CREATE-PAYMENT] safeCurrency:", safeCurrency);

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
      expire: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour
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
    // 10. GENERATE SIGNATURE
    // ======================================================
    const sign = await getApiSignatureAsync(allpayRequest, allpayApiKey);
    allpayRequest.sign = sign;

    console.log("[CREATE-PAYMENT] Allpay request:", JSON.stringify({ ...allpayRequest, sign: "[REDACTED]" }));

    // ======================================================
    // 11. CALL ALLPAY
    // ======================================================
    const allpayResponse = await fetch("https://allpay.to/app/?show=getpayment&mode=api11", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(allpayRequest),
    });

    const allpayData = await allpayResponse.json();
    console.log("[CREATE-PAYMENT] Allpay response:", JSON.stringify(allpayData));

    // ======================================================
    // 12. SAVE ORDER IN DB
    // IMPORTANT: use server-side safeAmount, not client amount
    // orders table remains backward-compatible
    // ======================================================
    const insertPayload: Record<string, unknown> = {
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
      provider: "allpay",
      provider_order_id: orderId,
      provider_status: allpayData?.status || null,
    };

    // Optional future compatibility if column already exists
    if (assignment_id) {
      insertPayload.assignment_id = assignment_id;
    }

    const { data: insertedOrder, error: insertError } = await serviceClient
      .from("orders")
      .insert(insertPayload)
      .select("id, allpay_order_id")
      .single();

    console.log("[CREATE-PAYMENT] DB insert result:", JSON.stringify(insertedOrder));

    if (insertError) {
      console.error("[CREATE-PAYMENT] Insert error:", insertError);
      return new Response(
        JSON.stringify({
          error: "Failed to create order",
          details: insertError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
        success: true,
        order_id: orderId,
        payment_url: allpayData.payment_url || null,
        amount: safeAmount,
        currency: safeCurrency,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[CREATE-PAYMENT] Unexpected error:", err);
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
