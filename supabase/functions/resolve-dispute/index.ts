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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Resolution = "client" | "tasker" | "close";

interface ResolveDisputeBody {
  dispute_id?: string;
  resolution?: Resolution;
  admin_note?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    console.error("[resolve-dispute] Missing env vars");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // 1. Authenticate caller
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const callerId = userData.user.id;

  // 2. Parse + validate body
  let body: ResolveDisputeBody;
  try {
    body = (await req.json()) as ResolveDisputeBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const disputeId = body.dispute_id?.trim();
  const resolution = body.resolution;
  const adminNote = body.admin_note?.trim() || null;

  if (!disputeId || !UUID_RE.test(disputeId)) {
    return jsonResponse({ error: "dispute_id is required (uuid)" }, 400);
  }
  if (!resolution || !["client", "tasker", "close"].includes(resolution)) {
    return jsonResponse({ error: "resolution must be 'client', 'tasker', or 'close'" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3. Authorize: admin or super_admin only
  const { data: roles, error: roleErr } = await admin.from("user_roles").select("role").eq("user_id", callerId);

  if (roleErr) {
    console.error("[resolve-dispute] role lookup error", roleErr);
    return jsonResponse({ error: "Failed to verify permissions" }, 500);
  }
  const isAdmin = !!roles && roles.some((r) => r.role === "admin" || r.role === "super_admin");
  if (!isAdmin) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // 4. Load dispute
  const { data: dispute, error: disputeErr } = await admin
    .from("disputes")
    .select("id, status, assignment_id, task_id")
    .eq("id", disputeId)
    .maybeSingle();

  if (disputeErr) {
    console.error("[resolve-dispute] load dispute error", disputeErr);
    return jsonResponse({ error: "Failed to load dispute" }, 500);
  }
  if (!dispute) {
    return jsonResponse({ error: "Dispute not found" }, 404);
  }

  // 5. Dispute must be open
  if (dispute.status !== "open") {
    return jsonResponse({ error: "Dispute is not open", status: dispute.status }, 409);
  }

  // 6. Load escrow by assignment_id
  const { data: escrow, error: escrowErr } = await admin
    .from("escrow_transactions")
    .select("id, status, assignment_id, task_id, tasker_id, client_id, amount, net_amount, commission_amount, currency")
    .eq("assignment_id", dispute.assignment_id)
    .maybeSingle();

  if (escrowErr) {
    console.error("[resolve-dispute] load escrow error", escrowErr);
    return jsonResponse({ error: "Failed to load escrow" }, 500);
  }
  if (!escrow) {
    return jsonResponse({ error: "Escrow not found for assignment" }, 404);
  }

  // 7. Escrow must be in disputed state (except for "close" where we still
  // require disputed since otherwise nothing to close)
  if (escrow.status !== "disputed") {
    return jsonResponse(
      {
        error: "Escrow is not in a disputed state",
        status: escrow.status,
      },
      409,
    );
  }

  const nowIso = new Date().toISOString();
  let escrowEventType: string | null = null;
  let payoutId: string | null = null;

  // 8. Apply resolution
  if (resolution === "tasker") {
    // Release to tasker
    const { data: updated, error: updateErr } = await admin
      .from("escrow_transactions")
      .update({
        status: "released",
        released_at: nowIso,
        release_mode: "dispute_resolution",
        updated_at: nowIso,
      })
      .eq("id", escrow.id)
      .eq("status", "disputed")
      .select("id")
      .maybeSingle();

    if (updateErr || !updated) {
      console.error("[resolve-dispute] release update error", updateErr);
      return jsonResponse({ error: "Failed to release escrow" }, 500);
    }

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
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (payoutErr) {
      console.error("[resolve-dispute] payout insert error", payoutErr);
    } else {
      payoutId = payout?.id ?? null;
    }

    escrowEventType = "escrow.released";
  } else if (resolution === "client") {
    // Refund to client
    const { data: updated, error: updateErr } = await admin
      .from("escrow_transactions")
      .update({
        status: "refunded",
        refunded_at: nowIso,
        refund_mode: "dispute_resolution",
        updated_at: nowIso,
      })
      .eq("id", escrow.id)
      .eq("status", "disputed")
      .select("id")
      .maybeSingle();

    if (updateErr || !updated) {
      console.error("[resolve-dispute] refund update error", updateErr);
      return jsonResponse({ error: "Failed to refund escrow" }, 500);
    }

    escrowEventType = "escrow.refunded";
  } else {
    // resolution === "close": keep funds locked, return escrow to "held"
    // so existing release flow can be triggered later by the parties.
    const { error: updateErr } = await admin
      .from("escrow_transactions")
      .update({
        status: "held",
        updated_at: nowIso,
      })
      .eq("id", escrow.id)
      .eq("status", "disputed");

    if (updateErr) {
      console.error("[resolve-dispute] close update error", updateErr);
      return jsonResponse({ error: "Failed to close dispute" }, 500);
    }
    // No escrow.* event for close (state returned to held, no money moved).
  }

  // 10. Update dispute → resolved
  const { data: resolvedDispute, error: disputeUpdateErr } = await admin
    .from("disputes")
    .update({
      status: "resolved",
      resolution_type:
        resolution === "tasker"
          ? "released_to_tasker"
          : resolution === "client"
            ? "refunded_to_client"
            : "closed_no_payout",
      resolution_note: adminNote,
      resolved_by: callerId,
      resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", dispute.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (disputeUpdateErr || !resolvedDispute) {
    console.error("[resolve-dispute] dispute update error", disputeUpdateErr);
    return jsonResponse({ error: "Failed to update dispute" }, 500);
  }

  // 11. Audit events
  const events: Array<Record<string, unknown>> = [
    {
      actor_id: callerId,
      event_type: "dispute.resolved",
      entity_type: "dispute",
      entity_id: dispute.id,
      metadata: {
        dispute_id: dispute.id,
        assignment_id: dispute.assignment_id,
        task_id: dispute.task_id,
        escrow_id: escrow.id,
        resolution,
        admin_note: adminNote,
      },
    },
  ];

  if (escrowEventType) {
    events.push({
      actor_id: callerId,
      event_type: escrowEventType,
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
        dispute_id: dispute.id,
        payout_id: payoutId,
        source: "dispute_resolution",
      },
    });
  }

  const { error: eventsErr } = await admin.from("app_events").insert(events);
  if (eventsErr) {
    console.error("[resolve-dispute] app_events insert error", eventsErr);
  }

  return jsonResponse({
    success: true,
    dispute_id: dispute.id,
    escrow_id: escrow.id,
    resolution,
    payout_id: payoutId,
    resolved_at: nowIso,
  });
});
