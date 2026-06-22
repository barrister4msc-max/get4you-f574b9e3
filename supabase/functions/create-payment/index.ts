import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getApiSignatureAsync } from "../_shared/allpay-signature.ts";

const allowedOrigins = [
  "https://4you.ai",
  "https://www.4you.ai",
  "https://lovable.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";

  const isAllowed =
    allowedOrigins.includes(origin) ||
    origin.endsWith(".lovable.app") ||
    origin.endsWith(".lovable.dev") ||
    origin.endsWith(".lovableproject.com");

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "https://4you.ai",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const requestCorsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: requestCorsHeaders });
  }

  try {
    const traceId = crypto.randomUUID();
    console.log("[CREATE-PAYMENT] function entered", { traceId, method: req.method, at: new Date().toISOString() });
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // 1. AUTH
    // ======================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Supabase environment is not configured" }), {
        status: 500,
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
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
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // ======================================================
    // 2. INPUT
    // IMPORTANT: do NOT trust amount/item_name from client
    // ======================================================
    const body = await req.json();

    await serviceClient.from("app_events").insert({
      actor_id: userId,
      event_type: "payment.create_started",
      entity_type: "order",
      metadata: {
        task_id: body?.task_id,
        proposal_id: body?.proposal_id,
      },
    });

    const {
      task_id,
      proposal_id,
      success_url,
      cancel_url,
      lang,
      currency: requestedCurrency,
      assignment_id,
    } = body ?? {};

    console.log("[CREATE-PAYMENT] create-payment called", {
      traceId,
      task_id: task_id ?? null,
      proposal_id: proposal_id ?? null,
      user_id: userId,
    });

    if (!proposal_id) {
      return new Response(JSON.stringify({ error: "proposal_id is required" }), {
        status: 400,
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
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
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
      });
    }

    if (proposal.status && !["pending", "selected", "accepted"].includes(String(proposal.status))) {
      return new Response(JSON.stringify({ error: "Proposal is not payable" }), {
        status: 400,
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
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
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
      });
    }

    if (task.user_id !== userId) {
      return new Response(JSON.stringify({ error: "You do not own this task" }), {
        status: 403,
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
      });
    }

    if (proposal.task_id !== task.id) {
      return new Response(JSON.stringify({ error: "Proposal does not belong to this task" }), {
        status: 400,
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======================================================
    // RATE LIMITING (spam / accidental retry protection)
    // ======================================================
    // 1) USER RATE LIMIT — max 5 orders per user per hour
    {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: userOrderCount } = await serviceClient
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", oneHourAgo);

      if ((userOrderCount ?? 0) >= 5) {
        console.log("[CREATE-PAYMENT] USER RATE LIMIT", { userId, count: userOrderCount });
        await serviceClient.from("app_events").insert({
          actor_id: userId,
          event_type: "payment.rate_limit_user",
          entity_type: "order",
          metadata: {
            user_id: userId,
            task_id: task.id,
            proposal_id: proposal.id,
            count: userOrderCount,
          },
        });
        return new Response(
          JSON.stringify({ error: "Too many payment attempts. Please try again later." }),
          { status: 429, headers: { ...requestCorsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // 2) TASK/PROPOSAL PENDING LIMIT — max 3 pending orders for same proposal
    {
      const { count: pendingCount } = await serviceClient
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("task_id", task.id)
        .eq("proposal_id", proposal.id)
        .eq("status", "pending");

      if ((pendingCount ?? 0) >= 3) {
        console.log("[CREATE-PAYMENT] PENDING RATE LIMIT", {
          task_id: task.id,
          proposal_id: proposal.id,
          count: pendingCount,
        });
        await serviceClient.from("app_events").insert({
          actor_id: userId,
          event_type: "payment.rate_limit_pending",
          entity_type: "order",
          metadata: {
            user_id: userId,
            task_id: task.id,
            proposal_id: proposal.id,
            count: pendingCount,
          },
        });
        return new Response(
          JSON.stringify({ error: "Too many pending payment attempts for this proposal" }),
          { status: 409, headers: { ...requestCorsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Hard guard: task must still be in a payable state.
    // Once a task moves to in_progress / completed / cancelled / closed,
    // no new payment may be initiated for it.
    const PAYABLE_TASK_STATUSES = ["draft", "open", "awaiting_payment"];
    if (task.status && !PAYABLE_TASK_STATUSES.includes(String(task.status))) {
      console.log("[CREATE-PAYMENT] Rejected: task not payable, status =", task.status);
      return new Response(
        JSON.stringify({
          error: "Task is no longer payable",
          task_status: task.status,
        }),
        {
          status: 409,
          headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Hard guard: if an escrow already exists for this task (held / released /
    // refunded), the task has already been funded once. Block any further
    // payment attempts to prevent the client from paying twice.
    const { data: existingEscrow } = await serviceClient
      .from("escrow_transactions")
      .select("id, status")
      .eq("task_id", task.id)
      .in("status", ["held", "released", "refunded"])
      .maybeSingle();

    if (existingEscrow) {
      return new Response(
        JSON.stringify({
          error: "This task has already been funded",
          escrow_id: existingEscrow.id,
          escrow_status: existingEscrow.status,
        }),
        {
          status: 409,
          headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ======================================================
    // 5. SERVER-SIDE SAFE VALUES
    // ======================================================
    const safeAmount = Number(proposal.price);

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid proposal price" }), {
        status: 400,
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeCurrency = proposal.currency || task.currency || requestedCurrency || "ILS";

    // Platform minimum task price = $50 USD equivalent. This mirrors the
    // frontend / DB validation. Updates here must stay in sync with
    // src/lib/pricing.ts and the validate_task_price() SQL trigger.
    const minByCurrency: Record<string, number> = {
      USD: 50,
      ILS: 180, // ≈ 50 USD at 3.6
      EUR: 45,
    };
    const minAmount = minByCurrency[safeCurrency] ?? 50;
    if (safeAmount < minAmount) {
      return new Response(
        JSON.stringify({
          error: `Minimum task price is ${minAmount} ${safeCurrency} (equivalent of $50).`,
        }),
        {
          status: 400,
          headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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

    console.log("[CREATE-PAYMENT] existing paid order", { traceId, id: existingPaidOrder?.id ?? null });

    if (existingPaidOrder) {
      return new Response(
        JSON.stringify({
          error: "This proposal has already been paid",
          order_id: existingPaidOrder.id,
        }),
        {
          status: 409,
          headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: existingPendingOrder } = await serviceClient
      .from("orders")
      .select("id, status, payment_url, allpay_order_id")
      .eq("task_id", task.id)
      .eq("proposal_id", proposal.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("[CREATE-PAYMENT] existing pending order", { traceId, id: existingPendingOrder?.id ?? null });

    // Re-payment policy: every fresh click of "Pay" must yield a brand-new
    // Allpay session, because Allpay invalidates payment_url after the user
    // closes/cancels the hosted page (subsequent visits show "payments are
    // no longer accepted"). We therefore mark the previous pending order as
    // `expired` and fall through to create a new orders row + Allpay order.
    // The old row is preserved (not deleted) for audit/history.
    if (existingPendingOrder?.id) {
      console.log("[CREATE-PAYMENT] expiring pending order", { traceId, id: existingPendingOrder.id });
      const { data: expiredRows, error: expireErr, count: expiredCount } = await serviceClient
        .from("orders")
        .update(
          {
            status: "expired",
            provider_status: "superseded_by_new_attempt",
          },
          { count: "exact" },
        )
        .eq("id", existingPendingOrder.id)
        .eq("status", "pending") // guard against race with webhook
        .select("id, status, provider_status, updated_at");
      console.log("[CREATE-PAYMENT] expired pending order result", {
        traceId,
        count: expiredCount ?? expiredRows?.length ?? 0,
        rows: expiredRows ?? [],
        error: expireErr?.message ?? null,
      });
      if (expireErr) {
        console.error("[CREATE-PAYMENT] Failed to expire old pending order:", expireErr);
      }
      await serviceClient.from("app_events").insert({
        actor_id: userId,
        event_type: "payment.pending_expired",
        entity_type: "order",
        entity_id: existingPendingOrder.id,
        metadata: {
          task_id: task.id,
          proposal_id: proposal.id,
          old_allpay_order_id: existingPendingOrder.allpay_order_id,
          reason: "user_retried_payment",
        },
      });
    }
    // ======================================================
    // 6. LOAD ALLPAY CREDENTIALS
    // ======================================================
    const allpayLogin = Deno.env.get("ALLPAY_LOGIN");
    const allpayApiKey = Deno.env.get("ALLPAY_API_KEY");

    if (!allpayLogin || !allpayApiKey) {
      return new Response(JSON.stringify({ error: "Payment service not configured" }), {
        status: 500,
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
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
    // 8.5 ORDER-FIRST: persist a pending order BEFORE calling Allpay.
    // Guarantees a local row exists even if upstream fails or webhook
    // races our response. amount/currency are server-side safe values.
    // ======================================================
    const initialOrderPayload: Record<string, unknown> = {
      user_id: userId,
      task_id: task.id,
      proposal_id: proposal.id,
      amount: safeAmount,
      currency: safeCurrency,
      allpay_order_id: orderId,
      provider: "allpay",
      provider_order_id: orderId,
      status: "pending",
      payment_url: null,
      allpay_response: null,
      provider_status: null,
      title: safeItemName,
    };
    if (assignment_id) {
      initialOrderPayload.assignment_id = assignment_id;
    }

    console.log("[CREATE-PAYMENT] creating new Allpay order", { traceId, allpay_order_id: orderId });

    const { data: insertedOrder, error: insertError } = await serviceClient
      .from("orders")
      .insert(initialOrderPayload)
      .select("id, allpay_order_id")
      .single();

    if (insertError || !insertedOrder) {
      console.error("[CREATE-PAYMENT] Pre-insert order error:", insertError);
      await serviceClient.from("app_events").insert({
        actor_id: userId,
        event_type: "payment.order_insert_failed",
        entity_type: "order",
        metadata: {
          provider_order_id: orderId,
          error: insertError?.message ?? "unknown",
        },
      });
      return new Response(
        JSON.stringify({ error: "Failed to create order", details: insertError?.message }),
        { status: 500, headers: { ...requestCorsHeaders, "Content-Type": "application/json" } },
      );
    }
    const localOrderId = insertedOrder.id as string;
    console.log("[CREATE-PAYMENT] new order created", {
      traceId,
      id: localOrderId,
      allpay_order_id: insertedOrder.allpay_order_id,
    });

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
    let allpayData: any;
    try {
      const allpayResponse = await fetch("https://allpay.to/app/?show=getpayment&mode=api11", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allpayRequest),
      });
      allpayData = await allpayResponse.json();
      console.log("[CREATE-PAYMENT] Allpay response:", JSON.stringify(allpayData));
      console.log("[CREATE-PAYMENT] new payment_url", { traceId, payment_url: allpayData?.payment_url ?? null });
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error("[CREATE-PAYMENT] Allpay fetch failed:", errMsg);
      await serviceClient
        .from("orders")
        .update({
          status: "failed",
          allpay_response: { error: errMsg, stage: "fetch" },
          provider_status: "fetch_error",
        })
        .eq("id", localOrderId);
      await serviceClient.from("app_events").insert({
        actor_id: userId,
        event_type: "payment.fetch_failed",
        entity_type: "order",
        entity_id: localOrderId,
        metadata: { provider_order_id: orderId, error: errMsg },
      });
      return new Response(
        JSON.stringify({ error: "Payment provider unreachable", order_id: orderId }),
        { status: 502, headers: { ...requestCorsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ======================================================
    // 12. UPDATE ORDER WITH ALLPAY RESPONSE
    // ======================================================
    const isAllpayError = !!allpayData?.error_code;
    const { error: updateError } = await serviceClient
      .from("orders")
      .update({
        status: isAllpayError ? "failed" : "pending",
        payment_url: allpayData?.payment_url || null,
        allpay_response: allpayData,
        provider_status: allpayData?.status || (isAllpayError ? "error" : null),
      })
      .eq("id", localOrderId);

    if (updateError) {
      console.error("[CREATE-PAYMENT] Order update error:", updateError);
      await serviceClient.from("app_events").insert({
        actor_id: userId,
        event_type: "payment.order_update_failed",
        entity_type: "order",
        entity_id: localOrderId,
        metadata: {
          provider_order_id: orderId,
          error: updateError.message,
          had_payment_url: !!allpayData?.payment_url,
        },
      });
      return new Response(
        JSON.stringify({
          error: "Failed to persist payment response",
          order_id: orderId,
        }),
        { status: 500, headers: { ...requestCorsHeaders, "Content-Type": "application/json" } },
      );
    }

    await serviceClient.from("app_events").insert({
      actor_id: userId,
      event_type: isAllpayError ? "payment.allpay_error" : "payment.created",
      entity_type: "order",
      entity_id: localOrderId,
      metadata: {
        amount: safeAmount,
        currency: safeCurrency,
        provider: "allpay",
        provider_order_id: orderId,
        ...(isAllpayError
          ? { error_code: allpayData?.error_code, error_msg: allpayData?.error_msg }
          : {}),
      },
    });

    // ======================================================
    // 13. HANDLE ALLPAY ERROR
    // ======================================================
    if (isAllpayError) {
      return new Response(
        JSON.stringify({
          error: allpayData.error_msg || "Payment creation failed",
          error_code: allpayData.error_code,
          order_id: orderId,
        }),
        { status: 400, headers: { ...requestCorsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ======================================================
    // 14. SUCCESS
    // ======================================================
    // Tasker notification (proposal_accepted) is emitted by the
    // notify_tasker_on_proposal_accept DB trigger when the proposal's
    // status flips to 'accepted'. Not emitted here to avoid duplicates
    // and premature notifications before payment actually succeeds.

    console.log("[CREATE-PAYMENT] final return", {
      traceId,
      success: true,
      order_id: orderId,
      payment_url: allpayData.payment_url || null,
      amount: safeAmount,
      currency: safeCurrency,
    });

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
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
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
        headers: { ...requestCorsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
