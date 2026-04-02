import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js/cors";

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

    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      // Send to tasker when they are hired
      if (!phone || !task_id) {
        return new Response(JSON.stringify({ error: "Missing phone or task_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const taskUrl = `https://get4you.lovable.app/tasks/${task_id}`;
      const text = message || `🎉 You've been selected for a task! View details: ${taskUrl}`;
      results.push(await sendWhatsApp(phone, text));
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
      results.push(await sendWhatsApp(phone, text));
    } else if (type === "admin_broadcast") {
      // Admin check
      const userId = claimsData.claims.sub as string;
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
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
        results.push(await sendWhatsApp(p, message));
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
