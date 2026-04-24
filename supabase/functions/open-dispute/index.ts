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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OpenDisputeBody {
  assignment_id?: string;
  reason?: string;
  description?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    console.error("[open-dispute] Missing env vars");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Authenticate the caller using their JWT.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const token = authHeader.replace(/^bearer\s+/i, "");
  const { data: claimsData, error: claimsErr } = await userClient.auth
    .getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userId = claimsData.claims.sub as string;

  // Parse body
  let body: OpenDisputeBody;
  try {
    body = (await req.json()) as OpenDisputeBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const assignmentId = body.assignment_id?.trim();
  const reason = body.reason?.trim();
  const description = body.description?.trim() || null;

  if (!assignmentId || !UUID_RE.test(assignmentId)) {
    return jsonResponse(
      { error: "assignment_id is required (uuid)" },
      400,
    );
  }
  if (!reason || reason.length < 3) {
    return jsonResponse(
      { error: "reason is required (min 3 characters)" },
      400,
    );
  }
  if (reason.length > 500) {
    return jsonResponse({ error: "reason is too long (max 500)" }, 400);
  }
  if (description && description.length > 2000) {
    return jsonResponse(
      { error: "description is too long (max 2000)" },
      400,
    );
  }

  // Service-role client for cross-table reads/writes that bypass RLS.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Load the assignment
  const { data: assignment, error: aErr } = await admin
    .from("task_assignments")
    .select("id, task_id, client_id, tasker_id, status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (aErr) {
    console.error("[open-dispute] assignment load error", aErr);
    return jsonResponse({ error: "Failed to load assignment" }, 500);
  }
  if (!assignment) {
    return jsonResponse({ error: "Assignment not found" }, 404);
  }

  // 2. Authorization: client, tasker, or admin/super_admin
  let isAdmin = false;
  {
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    isAdmin = (roles ?? []).some(
      (r: { role: string }) =>
        r.role === "admin" || r.role === "super_admin",
    );
  }
  const isParticipant =
    assignment.client_id === userId || assignment.tasker_id === userId;
  if (!isParticipant && !isAdmin) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // 3. Look up escrow for this assignment
  const { data: escrow, error: eErr } = await admin
    .from("escrow_transactions")
    .select("id, status, assignment_id")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (eErr) {
    console.error("[open-dispute] escrow load error", eErr);
    return jsonResponse({ error: "Failed to load escrow" }, 500);
  }

  // 4. Idempotency: if an open dispute already exists for this assignment,
  // return it instead of creating a duplicate.
  const { data: existingOpen } = await admin
    .from("disputes")
    .select("id, status")
    .eq("assignment_id", assignmentId)
    .eq("status", "open")
    .maybeSingle();
  if (existingOpen) {
    return jsonResponse({
      success: true,
      already_open: true,
      dispute_id: existingOpen.id,
    });
  }

  // 5. Lock the escrow if currently held
  if (escrow && escrow.status === "held") {
    const { error: lockErr } = await admin
      .from("escrow_transactions")
      .update({
        status: "disputed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", escrow.id)
      .eq("status", "held"); // race-safe
    if (lockErr) {
      console.error("[open-dispute] escrow lock error", lockErr);
      return jsonResponse({ error: "Failed to lock escrow" }, 500);
    }
  }

  // 6. Create the dispute row
  const againstUser = assignment.client_id === userId
    ? assignment.tasker_id
    : assignment.tasker_id === userId
    ? assignment.client_id
    : null;

  const { data: dispute, error: dErr } = await admin
    .from("disputes")
    .insert({
      assignment_id: assignmentId,
      task_id: assignment.task_id,
      escrow_id: escrow?.id ?? null,
      opened_by: userId,
      against_user: againstUser,
      reason,
      details: description,
      status: "open",
    })
    .select("id")
    .maybeSingle();
  if (dErr || !dispute) {
    console.error("[open-dispute] dispute insert error", dErr);
    // Best-effort: don't try to roll back the escrow lock; admin can re-open
    // the assignment manually if needed.
    return jsonResponse({ error: "Failed to create dispute" }, 500);
  }

  // 7. Audit event
  const { error: evtErr } = await admin.from("app_events").insert({
    actor_id: userId,
    event_type: "dispute.opened",
    entity_type: "assignment",
    entity_id: assignmentId,
    metadata: {
      dispute_id: dispute.id,
      assignment_id: assignmentId,
      task_id: assignment.task_id,
      escrow_id: escrow?.id ?? null,
      escrow_locked: escrow?.status === "held",
      opened_by_role: isAdmin
        ? "admin"
        : assignment.client_id === userId
        ? "client"
        : "tasker",
      reason,
      has_description: Boolean(description),
    },
  });
  if (evtErr) {
    console.error("[open-dispute] app_events insert error", evtErr);
  }

  return jsonResponse({
    success: true,
    dispute_id: dispute.id,
    escrow_locked: escrow?.status === "held",
  });
});