import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Only super_admin can manage admins
    const { data: isSuperAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Only super admin can manage roles" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, action = "add", role = "admin" } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate role
    const allowedRoles = ["client", "tasker", "admin"];
    if (!allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role. Cannot assign super_admin via this endpoint." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-modification
    const callerEmail = user.email?.toLowerCase();
    if (callerEmail === email.trim().toLowerCase()) {
      return new Response(JSON.stringify({ error: "Cannot modify your own roles" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find user by email
    const { data: profile } = await adminClient
      .from("profiles")
      .select("user_id, display_name")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: "User not found with this email" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent modifying another super_admin
    const { data: targetIsSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: profile.user_id,
      _role: "super_admin",
    });
    if (targetIsSuperAdmin) {
      return new Response(JSON.stringify({ error: "Cannot modify super admin roles" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any;

    if (action === "remove") {
      const { error: deleteError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", profile.user_id)
        .eq("role", role as any);

      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      result = { success: true, action: "removed", role, display_name: profile.display_name, user_id: profile.user_id };
    } else {
      // Check if already has role
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", profile.user_id)
        .eq("role", role as any)
        .maybeSingle();

      if (existingRole) {
        return new Response(
          JSON.stringify({ error: `User already has role: ${role}`, display_name: profile.display_name }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { error: insertError } = await adminClient
        .from("user_roles")
        .insert({ user_id: profile.user_id, role: role as any });

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      result = { success: true, action: "added", role, display_name: profile.display_name, user_id: profile.user_id };
    }

    // Audit log
    await adminClient.from("admin_audit_log").insert({
      actor_id: user.id,
      action: `role_${action === "remove" ? "removed" : "added"}`,
      target_type: "user",
      target_id: profile.user_id,
      details: { role, target_email: email.trim().toLowerCase(), target_name: profile.display_name },
    });

    await adminClient.from("app_events").insert({
      actor_id: user.id,
      event_type: action === "remove" ? "admin.role_removed" : "admin.role_added",
      entity_type: "user",
      entity_id: profile.user_id,
      metadata: {
        role,
        target_email: email.trim().toLowerCase(),
        target_name: profile.display_name,
      },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
