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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    // Only super_admin can use this endpoint
    const { data: isSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isSuperAdmin) {
      return json({ error: "Only super admin can manage users" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { action, target_user_id, role, reason } = body as {
      action?: string;
      target_user_id?: string;
      role?: string;
      reason?: string;
    };

    if (!action || !target_user_id) {
      return json({ error: "action and target_user_id are required" }, 400);
    }

    if (target_user_id === user.id) {
      return json({ error: "Cannot modify your own account" }, 400);
    }

    // Block touching other super admins
    const { data: targetIsSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: target_user_id,
      _role: "super_admin",
    });
    if (targetIsSuperAdmin) {
      return json({ error: "Cannot modify a super admin" }, 403);
    }

    const allowedRoles = ["client", "executor", "tasker", "admin"];

    if (action === "add_role" || action === "remove_role") {
      if (!role || !allowedRoles.includes(role)) {
        return json({ error: "Invalid role" }, 400);
      }

      if (action === "add_role") {
        const { data: existing } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", target_user_id)
          .eq("role", role as any)
          .maybeSingle();
        if (!existing) {
          const { error } = await adminClient
            .from("user_roles")
            .insert({ user_id: target_user_id, role: role as any });
          if (error) return json({ error: error.message }, 500);
        }
      } else {
        const { error } = await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", target_user_id)
          .eq("role", role as any);
        if (error) return json({ error: error.message }, 500);
      }

      await adminClient.from("admin_audit_log").insert({
        actor_id: user.id,
        action: `role_${action === "add_role" ? "added" : "removed"}`,
        target_type: "user",
        target_id: target_user_id,
        details: { role },
      });
      await adminClient.from("app_events").insert({
        actor_id: user.id,
        event_type:
          action === "add_role" ? "admin.role_added" : "admin.role_removed",
        entity_type: "user",
        entity_id: target_user_id,
        metadata: { role },
      });

      return json({ success: true, action, role, target_user_id });
    }

    if (action === "ban" || action === "unban") {
      if (action === "ban") {
        const { data: existing } = await adminClient
          .from("banned_users")
          .select("id")
          .eq("user_id", target_user_id)
          .maybeSingle();
        if (!existing) {
          const { error } = await adminClient.from("banned_users").insert({
            user_id: target_user_id,
            banned_by: user.id,
            reason: reason || "Blocked by super admin",
          });
          if (error) return json({ error: error.message }, 500);
        }
      } else {
        const { error } = await adminClient
          .from("banned_users")
          .delete()
          .eq("user_id", target_user_id);
        if (error) return json({ error: error.message }, 500);
      }

      await adminClient.from("admin_audit_log").insert({
        actor_id: user.id,
        action: action === "ban" ? "user_banned" : "user_unbanned",
        target_type: "user",
        target_id: target_user_id,
        details: { reason: reason || null },
      });
      await adminClient.from("app_events").insert({
        actor_id: user.id,
        event_type:
          action === "ban" ? "admin.user_banned" : "admin.user_unbanned",
        entity_type: "user",
        entity_id: target_user_id,
        metadata: { reason: reason || null },
      });

      return json({ success: true, action, target_user_id });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});