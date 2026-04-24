import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      .neq("status", "resolved");

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

  // 6. Create payout row for the tasker
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
    // Don't roll back the escrow release — log loudly so admins can reconcile.
    console.error("[release-escrow] payout insert error", payoutErr);
  }

  // 7. Audit event
  const { error: eventErr } = await admin.from("app_events").insert({
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
      payout_error: payoutErr?.message ?? null,
    },
  });
  if (eventErr) {
    console.error("[release-escrow] app_events insert error", eventErr);
  }

  return jsonResponse({
    success: true,
    escrow_id: escrow.id,
    payout_id: payout?.id ?? null,
    released_at: releasedAt,
  });
});