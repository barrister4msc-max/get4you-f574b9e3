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

type Action = "add" | "remove";
type SelfRole = "client" | "executor";

const ALLOWED_ROLES: readonly SelfRole[] = ["client", "executor"];
const ALLOWED_ACTIONS: readonly Action[] = ["add", "remove"];

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

    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;
    const role = body?.role as SelfRole | undefined;
    const target = (body?.user_id as string | undefined) ?? user.id;

    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return json({ error: "Invalid action" }, 400);
    }
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return json({ error: "Invalid role; must be client or executor" }, 400);
    }
    // Self-service only: cannot manage other users' roles via this endpoint.
    if (target !== user.id) {
      return json({ error: "Can only manage your own roles" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Read current ordinary roles for this user.
    const { data: existing, error: readErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["client", "executor", "tasker"] as never);
    if (readErr) return json({ error: readErr.message }, 500);

    const current = new Set<string>((existing ?? []).map((r: { role: string }) => r.role));

    if (action === "add") {
      // Mutual exclusion: cannot have both client and executor at the same time.
      const other: SelfRole = role === "client" ? "executor" : "client";
      if (current.has(other) || (role === "executor" && current.has("tasker"))) {
        return json(
          { error: "Cannot have both client and executor roles. Remove the other role first." },
          409,
        );
      }

      // Insert if missing (idempotent).
      if (!current.has(role)) {
        const { error } = await admin
          .from("user_roles")
          .insert({ user_id: user.id, role: role as never });
        if (error) return json({ error: error.message }, 500);
      }
      // Also normalise legacy `tasker` to `executor` if both somehow exist.
      if (role === "executor" && current.has("tasker")) {
        await admin
          .from("user_roles")
          .delete()
          .eq("user_id", user.id)
          .eq("role", "tasker" as never);
      }
      // Sync active_role on profile.
      await admin
        .from("profiles")
        .update({ active_role: role as never })
        .eq("user_id", user.id);

      return json({ success: true, action, role });
    }

    // remove
    const { error: delErr } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", user.id)
      .eq("role", role as never);
    if (delErr) return json({ error: delErr.message }, 500);

    // If we removed the active_role, fall back to whatever ordinary role
    // remains so the UI does not point at a role the user no longer has.
    const remaining = [...current].filter((r) => r !== role && (r === "client" || r === "executor"));
    if (remaining.length > 0) {
      await admin
        .from("profiles")
        .update({ active_role: remaining[0] as never })
        .eq("user_id", user.id);
    }

    return json({ success: true, action, role });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});