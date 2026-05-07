import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const TWILIO_FROM = "whatsapp:+14155238886"; // Twilio Sandbox

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured");

    // Two auth modes:
    //  1) Internal/system call from another edge function: must present
    //     X-Internal-Secret matching INTERNAL_FUNCTION_SECRET.
    //  2) User-triggered call: must present a valid Supabase JWT.
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const incomingInternal = req.headers.get("x-internal-secret");
    const isInternal =
      !!internalSecret && !!incomingInternal && incomingInternal === internalSecret;

    let userId: string | null = null;
    if (!isInternal) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } =
        await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auditSend = async (
      kind: string,
      to: string | string[],
      meta: Record<string, unknown>,
    ) => {
      try {
        await adminClient.from("app_events").insert({
          actor_id: userId,
          event_type: `whatsapp.${kind}`,
          entity_type: "whatsapp",
          metadata: { to, internal: isInternal, ...meta },
        });
      } catch (_) { /* swallow */ }
    };

    const body = await req.json();
    const { type, phone, message, task_id, phones } = body;

    // type: "tasker_hired" | "new_proposal" | "admin_broadcast"
    if (!type) {
      return new Response(JSON.stringify({ error: "Missing type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendWhatsApp = async (to: string, text: string) => {
      // Ensure whatsapp: prefix
      const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

      const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TWILIO_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: toNumber,
          From: TWILIO_FROM,
          Body: text,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error(`Twilio error [${response.status}]:`, data);
        return { success: false, error: data };
      }
      return { success: true, sid: data.sid };
    };

    const results: any[] = [];

    if (type === "tasker_hired") {
      if (!task_id || (!phone && !body.user_id)) {
        return new Response(JSON.stringify({ error: "Missing phone/user_id or task_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let targetPhone = phone;
      if (!targetPhone && body.user_id) {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("phone")
          .eq("user_id", body.user_id)
          .maybeSingle();
        targetPhone = profile?.phone;
      }
      if (!targetPhone) {
        return new Response(JSON.stringify({ error: "No phone found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const taskUrl = `https://get4you.lovable.app/tasks/${task_id}`;
      const text = message || `🎉 You've been selected for a task! View details: ${taskUrl}`;
      const r = await sendWhatsApp(targetPhone, text);
      results.push(r);
      await auditSend(r.success ? "sent" : "failed", targetPhone, { type, task_id });
    } else if (type === "new_proposal") {
      // Notify task owner about a new proposal
      if (!phone || !task_id) {
        return new Response(JSON.stringify({ error: "Missing phone or task_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const taskUrl = `https://get4you.lovable.app/tasks/${task_id}`;
      const text = message || `📩 New proposal on your task! View: ${taskUrl}`;
      const r = await sendWhatsApp(phone, text);
      results.push(r);
      await auditSend(r.success ? "sent" : "failed", phone, { type, task_id });
    } else if (type === "admin_broadcast") {
      // Admin broadcast is a user-triggered action only.
      if (isInternal || !userId) {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!phones || !Array.isArray(phones) || !message) {
        return new Response(JSON.stringify({ error: "Missing phones array or message" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      for (const p of phones) {
        const r = await sendWhatsApp(p, message);
        results.push(r);
        await auditSend(r.success ? "sent" : "failed", p, { type: "admin_broadcast" });
      }
    } else {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("WhatsApp send error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
