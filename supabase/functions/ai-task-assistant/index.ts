import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAILY_LIMIT = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages = [], type, tasks = [], targetLocale, userLocale } = await req.json();

    // Skip rate limiting for translation requests — they are background UI operations
    const skipRateLimit = type === "translate_tasks";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Rate limiting
      const authHeader = req.headers.get("authorization");
      if (skipRateLimit) {
        // no-op: translations are not user-initiated content generation
      } else
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user } } = await supabase.auth.getUser(token);

      if (user) {
        const { data: allowed } = await supabase.rpc("check_ai_rate_limit", {
          _user_id: user.id,
          _function_name: "task-assistant",
          _max_requests: DAILY_LIMIT,
        });

        if (!allowed) {
          return new Response(JSON.stringify({ error: "daily_limit", limit: DAILY_LIMIT }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabase.from("ai_usage").insert({
          user_id: user.id,
          function_name: "task-assistant",
        });
      }
    }

    const localeNames: Record<string, string> = {
      en: 'English',
      ru: 'Russian (Русский)',
      he: 'Hebrew (עברית)',
      ar: 'Arabic (العربية)',
    };
    const uiLang = (typeof userLocale === 'string' && localeNames[userLocale]) ? userLocale : 'en';
    const uiLangName = localeNames[uiLang];
    const langDirective = `IMPORTANT: The user interface language is ${uiLangName} (code: ${uiLang}). You MUST write ALL output text fields (title, description, location, improved_title, and any free-form text) in ${uiLangName}, regardless of the language of the user's input. Translate the user's message into ${uiLangName} for the structured fields. The "category" enum value stays in English.`;

    const systemPrompts: Record<string, string> = {
      assist: `You are a helpful task creation assistant for a task marketplace platform called TaskFlow. 
Help users describe their tasks clearly and in detail. Ask clarifying questions if the description is vague.
Suggest improvements to make the task more attractive to taskers.
Keep responses concise (2-3 sentences max). Always respond in ${uiLangName} (the user's chosen UI language), regardless of the language of the user input.
Available categories: cleaning, moving, repair, digital, consulting, delivery, beauty, tutoring.`,

      categorize: `You are a task categorization AI for a marketplace platform. 
Given a task description, you must determine:
1. The best category from: cleaning, moving, repair, digital, consulting, delivery, beauty, tutoring
2. Suggested budget range in USD (min and max)
3. Whether the task is onsite or remote
4. Suggested urgency: flexible, soon, or urgent
5. An improved title written in ${uiLangName}.

${langDirective}
You MUST respond using the provided tool/function.`,

      voice_to_task: `You are a task structuring AI for a marketplace platform.
Given a voice transcription from a user, extract and structure it into a task with:
1. A clear, concise title in ${uiLangName}
2. A detailed description in ${uiLangName}
3. The best category from: cleaning, moving, repair, digital, consulting, delivery, beauty, tutoring
4. Suggested budget in USD
5. Whether the task is onsite or remote
6. Location if mentioned (in ${uiLangName})

Clean up speech artifacts, filler words, and make the text professional.
${langDirective}
You MUST respond using the provided tool/function.`,

      translate_tasks: `You translate marketplace task listings.
Translate every task title and description into the requested target locale.
Preserve meaning, tone, names, addresses, and numbers.
If text is already in the target language, keep it natural.
Output MUST be strictly in the requested locale (${targetLocale ?? 'target locale'}) and never default to English or the source language.
You MUST respond using the provided tool/function.`,
    };

    const promptMessages = type === "translate_tasks"
      ? [{
          role: "user",
          content: JSON.stringify({
            target_locale: targetLocale,
            tasks,
          }),
        }]
      : messages;

    const useToolCalling = type === "categorize" || type === "voice_to_task" || type === "translate_tasks";
    const body: Record<string, unknown> = {
      model: useToolCalling ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompts[type] || systemPrompts.assist },
        ...promptMessages,
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
    } else if (type === "voice_to_task") {
      body.tools = [
        {
          type: "function",
          function: {
            name: "structure_task",
            description: "Structure voice input into a task",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Clear concise task title" },
                description: { type: "string", description: "Detailed task description" },
                category: { type: "string", enum: ["cleaning", "moving", "repair", "digital", "consulting", "delivery", "beauty", "tutoring"] },
                budget: { type: "number", description: "Suggested budget in USD" },
                task_type: { type: "string", enum: ["onsite", "remote"] },
                location: { type: "string", description: "Location if mentioned, empty string otherwise" },
              },
              required: ["title", "description", "category", "budget", "task_type", "location"],
              additionalProperties: false,
            },
          },
        },
      ];
      body.tool_choice = { type: "function", function: { name: "structure_task" } };
      body.stream = false;
    } else if (type === "translate_tasks") {
      body.tools = [
        {
          type: "function",
          function: {
            name: "translate_tasks",
            description: "Translate task titles and descriptions into the requested language",
            parameters: {
              type: "object",
              properties: {
                translations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      description: { type: ["string", "null"] },
                    },
                    required: ["id", "title", "description"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["translations"],
              additionalProperties: false,
            },
          },
        },
      ];
      body.tool_choice = { type: "function", function: { name: "translate_tasks" } };
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

    if (type === "categorize" || type === "translate_tasks" || type === "voice_to_task") {
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const result = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "No result from AI" }), {
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
