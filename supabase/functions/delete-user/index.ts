import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isSuperAdmin) return json({ error: "Only super admin can delete users" }, 403);

    const { target_user_id, reason } = await req.json().catch(() => ({}));
    if (!target_user_id) return json({ error: "target_user_id required" }, 400);
    if (target_user_id === user.id) return json({ error: "Cannot delete your own account" }, 400);

    const { data: targetIsSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: target_user_id,
      _role: "super_admin",
    });
    if (targetIsSuperAdmin) return json({ error: "Cannot delete a super admin" }, 403);

    // Best-effort cleanup of rows that may not have ON DELETE CASCADE
    await adminClient.from("user_roles").delete().eq("user_id", target_user_id);
    await adminClient.from("profiles").delete().eq("user_id", target_user_id);

    const { error: delErr } = await adminClient.auth.admin.deleteUser(target_user_id);
    if (delErr) return json({ error: delErr.message }, 500);

    await adminClient.from("admin_audit_log").insert({
      actor_id: user.id,
      action: "user_deleted",
      target_type: "user",
      target_id: target_user_id,
      details: { reason: reason || null },
    });

    return json({ success: true, target_user_id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});