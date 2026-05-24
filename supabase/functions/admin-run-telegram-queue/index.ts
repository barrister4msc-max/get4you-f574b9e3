import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const logEvent = async (event: string, metadata: Record<string, unknown>, userId?: string | null) => {
    try {
      await admin.from("app_events").insert({
        event_type: event, entity_type: "telegram_queue",
        actor_user_id: userId ?? null, metadata,
      });
    } catch (_) { /* swallow */ }
  };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.slice("Bearer ".length);
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
      admin.rpc("has_role", { _user_id: userId, _role: "admin" }),
      admin.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    ]);
    if (!isAdmin && !isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!INTERNAL_SECRET) {
      await logEvent("telegram.queue_manual_run_failed", { error: "INTERNAL_FUNCTION_SECRET not set" }, userId);
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let limit = 10;
    try {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 100) limit = body.limit;
    } catch (_) { /* ignore */ }

    await logEvent("telegram.queue_manual_run_started", { limit }, userId);

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/process-telegram-queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET },
      body: JSON.stringify({ limit }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      await logEvent("telegram.queue_manual_run_failed", { status: resp.status, response: data }, userId);
      return new Response(JSON.stringify({ error: "Queue run failed", status: resp.status, response: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await logEvent("telegram.queue_manual_run_finished", {
      processed: (data as { processed?: number }).processed ?? null,
    }, userId);
    return new Response(JSON.stringify(data), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logEvent("telegram.queue_manual_run_failed", { error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});