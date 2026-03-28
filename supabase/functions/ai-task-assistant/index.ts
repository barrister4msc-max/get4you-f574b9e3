import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, type } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompts: Record<string, string> = {
      assist: `You are a helpful task creation assistant for a task marketplace platform called Hooppy. 
Help users describe their tasks clearly and in detail. Ask clarifying questions if the description is vague.
Suggest improvements to make the task more attractive to taskers.
Keep responses concise (2-3 sentences max). Respond in the same language the user writes in.
Available categories: cleaning, moving, repair, digital, consulting, delivery, beauty, tutoring.`,

      categorize: `You are a task categorization AI for a marketplace platform. 
Given a task description, you must determine:
1. The best category from: cleaning, moving, repair, digital, consulting, delivery, beauty, tutoring
2. Suggested budget range in USD (min and max)
3. Whether the task is onsite or remote
4. Suggested urgency: flexible, soon, or urgent

You MUST respond using the provided tool/function.`,
    };

    const body: Record<string, unknown> = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompts[type] || systemPrompts.assist },
        ...messages,
      ],
    };

    if (type === "categorize") {
      body.tools = [
        {
          type: "function",
          function: {
            name: "categorize_task",
            description: "Categorize a task and suggest budget",
            parameters: {
              type: "object",
              properties: {
                category: { type: "string", enum: ["cleaning", "moving", "repair", "digital", "consulting", "delivery", "beauty", "tutoring"] },
                budget_min: { type: "number", description: "Suggested minimum budget in USD" },
                budget_max: { type: "number", description: "Suggested maximum budget in USD" },
                task_type: { type: "string", enum: ["onsite", "remote"] },
                urgency: { type: "string", enum: ["flexible", "soon", "urgent"] },
                improved_title: { type: "string", description: "A clear, concise title for the task" },
              },
              required: ["category", "budget_min", "budget_max", "task_type", "urgency", "improved_title"],
              additionalProperties: false,
            },
          },
        },
      ];
      body.tool_choice = { type: "function", function: { name: "categorize_task" } };
      body.stream = false;
    } else {
      body.stream = true;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "categorize") {
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const result = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "No categorization result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("AI task assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
