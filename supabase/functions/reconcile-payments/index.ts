import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Reconcile paid orders without escrow.
 *
 * Two modes:
 *  - Cron / global: scans recent paid orders that don't have an escrow row yet
 *    and creates the missing assignment + escrow.
 *  - Per-task: when called with { task_id } from the UI, returns the current
 *    payment + escrow status so the client can refresh without page reload,
 *    and triggers reconciliation just for that task.
 */

type ReconcileBody = {
  task_id?: string;
  order_id?: string;
  lookback_minutes?: number;
};

const COMMISSION_RATE = 0.15;

async function reconcileOrder(serviceClient: any, order: any) {
  // Skip if not paid
  if (order.status !== "paid") return { skipped: true, reason: "not_paid" };
  if (!order.task_id || !order.proposal_id) {
    return { skipped: true, reason: "missing_task_or_proposal" };
  }

  // Check if escrow already exists
  const { data: existingEscrow } = await serviceClient
    .from("escrow_transactions")
    .select("id, assignment_id, status")
    .eq("task_id", order.task_id)
    .eq("proposal_id", order.proposal_id)
    .maybeSingle();

  // Load proposal + task
  const { data: proposal } = await serviceClient
    .from("proposals")
    .select("*")
    .eq("id", order.proposal_id)
    .maybeSingle();

  const { data: task } = await serviceClient
    .from("tasks")
    .select("*")
    .eq("id", order.task_id)
    .maybeSingle();

  if (!proposal || !task) {
    return { skipped: true, reason: "missing_proposal_or_task" };
  }

  const orderAmount = Number(order.amount);
  const commissionAmount = Math.round(orderAmount * COMMISSION_RATE * 100) / 100;
  const netAmount = Math.round((orderAmount - commissionAmount) * 100) / 100;
  const currency = order.currency || proposal.currency || task.currency || "ILS";

  // Ensure proposal is accepted
  if (proposal.status !== "accepted") {
    await serviceClient.from("proposals").update({ status: "accepted" }).eq("id", proposal.id);
    await serviceClient
      .from("proposals")
      .update({ status: "rejected" })
      .eq("task_id", task.id)
      .neq("id", proposal.id)
      .eq("status", "pending");
  }

  // Ensure task is in_progress + assigned
  if (task.status !== "in_progress" && task.status !== "completed") {
    await serviceClient
      .from("tasks")
      .update({ status: "in_progress", assigned_to: proposal.user_id })
      .eq("id", task.id);
  }

  // Ensure assignment exists
  let assignmentId: string | null = order.assignment_id ?? null;

  if (!assignmentId) {
    const { data: existingAssignment } = await serviceClient
      .from("task_assignments")
      .select("id")
      .eq("task_id", task.id)
      .maybeSingle();

    if (existingAssignment) {
      assignmentId = existingAssignment.id;
    } else {
      const { data: newAssignment } = await serviceClient
        .from("task_assignments")
        .insert({
          task_id: task.id,
          proposal_id: proposal.id,
          client_id: order.user_id,
          tasker_id: proposal.user_id,
          agreed_price: orderAmount,
          currency,
          commission_rate: COMMISSION_RATE,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          status: "in_progress",
          funded_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      assignmentId = newAssignment?.id ?? null;
    }

    if (assignmentId) {
      await serviceClient
        .from("orders")
        .update({ assignment_id: assignmentId })
        .eq("id", order.id);
    }
  }

  // Create escrow if missing
  let escrowCreated = false;
  if (!existingEscrow) {
    const { error: escrowInsertError } = await serviceClient
      .from("escrow_transactions")
      .insert({
        task_id: task.id,
        proposal_id: proposal.id,
        assignment_id: assignmentId,
        client_id: order.user_id,
        tasker_id: proposal.user_id,
        amount: orderAmount,
        currency,
        commission_rate: COMMISSION_RATE,
        commission_amount: commissionAmount,
        net_amount: netAmount,
        status: "held",
      });

    if (escrowInsertError) {
      await serviceClient.from("app_events").insert({
        event_type: "payment.reconcile_escrow_failed",
        entity_type: "order",
        entity_id: order.id,
        metadata: {
          task_id: task.id,
          proposal_id: proposal.id,
          error: escrowInsertError.message,
        },
      });
      return { reconciled: false, error: escrowInsertError.message };
    }

    escrowCreated = true;

    await serviceClient.from("app_events").insert({
      event_type: "payment.reconcile_escrow_created",
      entity_type: "order",
      entity_id: order.id,
      metadata: {
        task_id: task.id,
        proposal_id: proposal.id,
        assignment_id: assignmentId,
        amount: orderAmount,
        currency,
      },
    });
  } else if (assignmentId && !existingEscrow.assignment_id) {
    await serviceClient
      .from("escrow_transactions")
      .update({ assignment_id: assignmentId })
      .eq("id", existingEscrow.id);
  }

  return {
    reconciled: true,
    escrow_created: escrowCreated,
    assignment_id: assignmentId,
    task_id: task.id,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    let body: ReconcileBody = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    // ========= Per-task / per-order mode =========
    if (body.task_id || body.order_id) {
      let query = serviceClient
        .from("orders")
        .select("*")
        .eq("status", "paid")
        .order("created_at", { ascending: false });

      if (body.order_id) query = query.eq("id", body.order_id);
      if (body.task_id) query = query.eq("task_id", body.task_id);

      const { data: orders, error: ordersError } = await query.limit(5);

      if (ordersError) {
        return new Response(JSON.stringify({ error: ordersError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = [];
      for (const order of orders ?? []) {
        const r = await reconcileOrder(serviceClient, order);
        results.push({ order_id: order.id, ...r });
      }

      // Return current escrow + order state for the UI
      let escrowState = null;
      let orderState = null;
      let taskState = null;

      if (body.task_id) {
        const { data: escrow } = await serviceClient
          .from("escrow_transactions")
          .select("*")
          .eq("task_id", body.task_id)
          .maybeSingle();
        escrowState = escrow;

        const { data: latestOrder } = await serviceClient
          .from("orders")
          .select("id, status, payment_url, provider_status, created_at, proposal_id, assignment_id")
          .eq("task_id", body.task_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        orderState = latestOrder;

        const { data: t } = await serviceClient
          .from("tasks")
          .select("id, status, assigned_to")
          .eq("id", body.task_id)
          .maybeSingle();
        taskState = t;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          mode: "single",
          processed: results.length,
          results,
          state: {
            escrow: escrowState,
            order: orderState,
            task: taskState,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ========= Cron / batch mode =========
    const lookbackMinutes = body.lookback_minutes ?? 60 * 24; // default: last 24h
    const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

    const { data: paidOrders, error: paidError } = await serviceClient
      .from("orders")
      .select("*")
      .eq("status", "paid")
      .gte("updated_at", since)
      .limit(200);

    if (paidError) {
      return new Response(JSON.stringify({ error: paidError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    let createdCount = 0;

    for (const order of paidOrders ?? []) {
      const r = await reconcileOrder(serviceClient, order);
      if (r.reconciled && (r as any).escrow_created) createdCount++;
      results.push({ order_id: order.id, ...r });
    }

    if (createdCount > 0) {
      await serviceClient.from("app_events").insert({
        event_type: "payment.reconcile_batch_completed",
        entity_type: "order",
        metadata: {
          scanned: results.length,
          escrow_created: createdCount,
          since,
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode: "batch",
        scanned: results.length,
        escrow_created: createdCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[RECONCILE-PAYMENTS] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});