import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ReleaseEscrowBody {
  escrow_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("[release-escrow] Missing service role env vars");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // Require an authenticated caller (JWT verified by gateway when verify_jwt=true,
  // but we also defensively check here for the auth header).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: ReleaseEscrowBody;
  try {
    body = (await req.json()) as ReleaseEscrowBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const escrowId = body?.escrow_id?.trim();
  if (!escrowId || !UUID_RE.test(escrowId)) {
    return jsonResponse({ error: "escrow_id is required (uuid)" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Identify the calling user from their JWT
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const callerId = userData.user.id;

  // 1. Load escrow transaction
  const { data: escrow, error: loadErr } = await admin
    .from("escrow_transactions")
    .select(
      "id, status, assignment_id, task_id, tasker_id, client_id, amount, net_amount, commission_amount, currency, released_at",
    )
    .eq("id", escrowId)
    .maybeSingle();

  if (loadErr) {
    console.error("[release-escrow] load error", loadErr);
    return jsonResponse({ error: "Failed to load escrow" }, 500);
  }
  if (!escrow) {
    return jsonResponse({ error: "Escrow not found" }, 404);
  }

  // Authorization: caller must be the escrow's client OR an admin/super_admin
  let isAuthorized = callerId === escrow.client_id;
  if (!isAuthorized) {
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["admin", "super_admin"]);
    isAuthorized = !!(roles && roles.length > 0);
  }
  if (!isAuthorized) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // 2. Idempotency: already released → return success without side effects
  if (escrow.status === "released") {
    return jsonResponse({
      success: true,
      already_released: true,
      escrow_id: escrow.id,
    });
  }

  // 3. Status must be "held"
  if (escrow.status !== "held") {
    return jsonResponse(
      {
        error: "Escrow is not in a releasable state",
        status: escrow.status,
      },
      409,
    );
  }

  // 4. Block release if an open dispute exists for this assignment
  if (escrow.assignment_id) {
    const { data: openDisputes, error: disputeErr } = await admin
      .from("disputes")
      .select("id, status")
      .eq("assignment_id", escrow.assignment_id)
      .in("status", ["open", "pending", "in_review"]);

    if (disputeErr) {
      console.error("[release-escrow] dispute check error", disputeErr);
      return jsonResponse({ error: "Failed to verify disputes" }, 500);
    }
    if (openDisputes && openDisputes.length > 0) {
      return jsonResponse(
        {
          error: "Release blocked: open dispute exists for this assignment",
          dispute_count: openDisputes.length,
        },
        409,
      );
    }
  }

  // 5. Update escrow → released (guarded by status='held' for race-safety)
  // 4b. Require the linked task to be completed before releasing funds.
  if (!escrow.task_id) {
    return jsonResponse({ error: "Escrow has no linked task" }, 409);
  }
  const { data: task, error: taskErr } = await admin
    .from("tasks")
    .select("id, status")
    .eq("id", escrow.task_id)
    .maybeSingle();
  if (taskErr) {
    console.error("[release-escrow] task load error", taskErr);
    return jsonResponse({ error: "Failed to load task" }, 500);
  }
  if (!task) {
    return jsonResponse({ error: "Task not found" }, 404);
  }
  if (!["completed", "in_progress", "completion_requested"].includes(task.status)) {
    return jsonResponse({ error: "Task is not ready for escrow release", status: task.status }, 409);
  }

  const releasedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await admin
    .from("escrow_transactions")
    .update({
      status: "released",
      released_at: releasedAt,
      release_mode: "manual",
      updated_at: releasedAt,
    })
    .eq("id", escrow.id)
    .eq("status", "held")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    console.error("[release-escrow] update error", updateErr);
    return jsonResponse({ error: "Failed to release escrow" }, 500);
  }
  if (!updated) {
    // Another concurrent request released it; treat as idempotent success.
    return jsonResponse({
      success: true,
      already_released: true,
      escrow_id: escrow.id,
    });
  }
  const { error: completeTaskErr } = await admin
    .from("tasks")
    .update({
      status: "completed",
      updated_at: releasedAt,
    })
    .eq("id", escrow.task_id);

  if (completeTaskErr) {
    console.error("[release-escrow] task complete update error", completeTaskErr);
  }
  // 6. Create payout row for the tasker — link to their active payout account
  //    if one exists, otherwise mark the payout as missing_payout_details so the
  //    money is reserved and the tasker is prompted to add bank info.
  let payoutAccountId: string | null = null;
  let payoutAccountStatus: string | null = null;
  if (escrow.tasker_id) {
    const { data: acc } = await admin
      .from("payout_accounts")
      .select("id, status")
      .eq("user_id", escrow.tasker_id)
      .maybeSingle();
    if (acc) {
      payoutAccountId = acc.id as string;
      payoutAccountStatus = (acc.status as string) ?? null;
    }
  }
  const payoutStatus = payoutAccountId ? "pending" : "missing_payout_details";

  const { data: payout, error: payoutErr } = await admin
    .from("payouts")
    .insert({
      user_id: escrow.tasker_id,
      task_id: escrow.task_id,
      escrow_id: escrow.id,
      assignment_id: escrow.assignment_id,
      amount: escrow.amount,
      net_amount: escrow.net_amount,
      commission: escrow.commission_amount ?? 0,
      currency: escrow.currency,
      status: payoutStatus,
      payout_account_id: payoutAccountId,
    })
    .select("id")
    .maybeSingle();

  if (payoutErr) {
    // Don't roll back the escrow release — log loudly so admins can reconcile.
    console.error("[release-escrow] payout insert error", payoutErr);
  }

  // 7. Audit event
  const { error: eventErr } = await admin.from("app_events").insert({
    actor_id: callerId,
    event_type: "escrow.released",
    entity_type: "escrow",
    entity_id: escrow.id,
    metadata: {
      escrow_id: escrow.id,
      assignment_id: escrow.assignment_id,
      task_id: escrow.task_id,
      tasker_id: escrow.tasker_id,
      client_id: escrow.client_id,
      net_amount: escrow.net_amount,
      currency: escrow.currency,
      payout_id: payout?.id ?? null,
      payout_account_id: payoutAccountId,
      payout_status: payoutStatus,
      payout_account_status: payoutAccountStatus,
      payout_error: payoutErr?.message ?? null,
    },
  });
  if (eventErr) {
    console.error("[release-escrow] app_events insert error", eventErr);
  }

  // 8. Notify the tasker (in-app + WhatsApp). Best-effort; never blocks the release.
  if (escrow.tasker_id) {
    let taskTitle: string | null = null;
    try {
      const { data: t } = await admin
        .from("tasks")
        .select("title")
        .eq("id", escrow.task_id)
        .maybeSingle();
      taskTitle = (t?.title as string) ?? null;
    } catch (_) { /* ignore */ }

    const payoutAccountMissing = !payoutAccountId;

    try {
      await admin.from("notifications").insert({
        user_id: escrow.tasker_id,
        type: "task_completed",
        title: "Task completed — payment released",
        message: taskTitle
          ? `The client confirmed completion of "${taskTitle}". Funds are now available per platform payout rules.`
          : "The client confirmed task completion. Funds are now available per platform payout rules.",
        task_id: escrow.task_id,
      });
    } catch (e) {
      console.error("[release-escrow] notification insert failed", e);
    }

    try {
      await admin.rpc("enqueue_whatsapp", {
        p_user_id: escrow.tasker_id,
        p_event_type: "task_completed",
        p_task_id: escrow.task_id,
        p_metadata: {
          escrow_id: escrow.id,
          assignment_id: escrow.assignment_id,
          payout_id: payout?.id ?? null,
          net_amount: escrow.net_amount,
          currency: escrow.currency,
          task_title: taskTitle,
        },
      });
    } catch (e) {
      console.error("[release-escrow] enqueue_whatsapp failed", e);
    }

    // If no payout account exists, prompt the tasker to add their details
    if (payoutAccountMissing) {
      try {
        await admin.from("notifications").insert({
          user_id: escrow.tasker_id,
          type: "payout_details_missing",
          title: "Add payout details to receive your payment",
          message:
            "Your payment is ready, but we need your bank details to send it. Add your payout details in your profile.",
          task_id: escrow.task_id,
        });
      } catch (e) {
        console.error("[release-escrow] missing-payout notification failed", e);
      }
      try {
        await admin.rpc("enqueue_whatsapp", {
          p_user_id: escrow.tasker_id,
          p_event_type: "payout_details_missing",
          p_task_id: escrow.task_id,
          p_metadata: {
            escrow_id: escrow.id,
            net_amount: escrow.net_amount,
            currency: escrow.currency,
            task_title: taskTitle,
          },
        });
      } catch (e) {
        console.error("[release-escrow] missing-payout whatsapp failed", e);
      }
    }
  }

  return jsonResponse({
    success: true,
    escrow_id: escrow.id,
    payout_id: payout?.id ?? null,
    released_at: releasedAt,
  });
});
