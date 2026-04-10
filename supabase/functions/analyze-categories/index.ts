import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get tasks without a category
    const { data: uncategorizedTasks } = await supabase
      .from("tasks")
      .select("id, title, description")
      .is("category_id", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!uncategorizedTasks?.length || uncategorizedTasks.length < 3) {
      return new Response(JSON.stringify({ message: "Not enough uncategorized tasks to analyze", count: uncategorizedTasks?.length ?? 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing categories to avoid duplicates
    const { data: existingCategories } = await supabase
      .from("categories")
      .select("name_en, name_ru, name_he");

    const existingNames = existingCategories?.map(c => c.name_en.toLowerCase()) ?? [];

    // Get already pending suggestions
    const { data: pendingSuggestions } = await supabase
      .from("category_suggestions")
      .select("suggested_name")
      .eq("status", "pending");

    const pendingNames = pendingSuggestions?.map(s => s.suggested_name.toLowerCase()) ?? [];

    const taskList = uncategorizedTasks.map((t, i) =>
      `${i + 1}. [ID: ${t.id}] "${t.title}" — ${t.description?.substring(0, 200) ?? "no description"}`
    ).join("\n");

    const existingList = existingNames.join(", ");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are analyzing task listings to find patterns and suggest new service categories.
Existing categories: ${existingList}
Already suggested: ${pendingNames.join(", ")}

Rules:
- Only suggest a category if 3+ tasks clearly match it
- Don't suggest categories that already exist or are already pending
- Provide names in English, Russian, and Hebrew
- Return a JSON array of suggestions`,
          },
          {
            role: "user",
            content: `Analyze these uncategorized tasks and suggest new categories:\n\n${taskList}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_categories",
            description: "Suggest new service categories based on task patterns",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name_en: { type: "string", description: "Category name in English" },
                      name_ru: { type: "string", description: "Category name in Russian" },
                      name_he: { type: "string", description: "Category name in Hebrew" },
                      description: { type: "string", description: "Brief description" },
                      matched_task_ids: { type: "array", items: { type: "string" }, description: "IDs of matching tasks" },
                    },
                    required: ["name_en", "name_ru", "name_he", "description", "matched_task_ids"],
                  },
                },
              },
              required: ["suggestions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_categories" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ message: "No suggestions generated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { suggestions } = JSON.parse(toolCall.function.arguments);

    // Insert suggestions
    let inserted = 0;
    for (const s of suggestions) {
      // Skip if already exists or pending
      if (existingNames.includes(s.name_en.toLowerCase()) || pendingNames.includes(s.name_en.toLowerCase())) continue;

      const { error } = await supabase.from("category_suggestions").insert({
        suggested_name: s.name_en,
        suggested_name_ru: s.name_ru,
        suggested_name_he: s.name_he,
        description: s.description,
        matched_task_ids: s.matched_task_ids,
        match_count: s.matched_task_ids.length,
      });

      if (!error) inserted++;
    }

    return new Response(JSON.stringify({ message: `${inserted} new category suggestions created`, total_analyzed: uncategorizedTasks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
