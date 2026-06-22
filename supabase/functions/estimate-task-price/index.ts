import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

// Platform minimum task price ($50 USD), expressed in the response currency (ILS by default).
const MIN_USD = 50;
const USD_ILS_FALLBACK = 3.7;

async function getMinILS(): Promise<number> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if (r.ok) {
      const d = await r.json();
      const rate = Number(d?.rates?.ILS);
      if (Number.isFinite(rate) && rate > 0) return Math.ceil(MIN_USD * rate);
    }
  } catch (_) {
    /* ignore — fall back */
  }
  return Math.ceil(MIN_USD * USD_ILS_FALLBACK);
}

function clampEstimateILS(result: {
  min_price: number; max_price: number; recommended_price: number;
}, minILS: number) {
  const min = Math.max(Math.round(result.min_price), minILS);
  const rec = Math.max(Math.round(result.recommended_price), minILS);
  const max = Math.max(Math.round(result.max_price), rec);
  return { min_price: min, recommended_price: rec, max_price: max };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { city, category, title, description, userLocale } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve category_id from the category slug/name
    let categoryId: string | null = null;
    if (category) {
      const cap = category.charAt(0).toUpperCase() + category.slice(1);
      const { data: cat } = await supabase
        .from("categories")
        .select("id")
        .or(`name_en.eq.${cap},name_en.ilike.%${category}%`)
        .maybeSingle();
      categoryId = cat?.id ?? null;
    }

    // ============ Priority #1: marketplace history ============
    // Pull accepted proposals on tasks of the same category, prefer same city.
    const collectPrices = async (sameCity: boolean): Promise<number[]> => {
      let q = supabase
        .from("tasks")
        .select("id, city, category_id, proposals!inner(price, status)")
        .eq("proposals.status", "accepted")
        .limit(500);
      if (categoryId) q = q.eq("category_id", categoryId);
      if (sameCity && city) q = q.ilike("city", city);
      const { data, error } = await q;
      if (error || !data) return [];
      const prices: number[] = [];
      for (const row of data as Array<{ proposals: Array<{ price: number }> }>) {
        for (const p of row.proposals || []) {
          const v = Number(p.price);
          if (Number.isFinite(v) && v > 0) prices.push(v);
        }
      }
      return prices;
    };

    let prices = city ? await collectPrices(true) : [];
    let scope: "city" | "global" | "ai" = "city";
    if (prices.length < 5) {
      prices = await collectPrices(false);
      scope = "global";
    }

    if (prices.length >= 5) {
      const sorted = [...prices].sort((a, b) => a - b);
      const minILS = await getMinILS();
      const clamped = clampEstimateILS({
        min_price: quantile(sorted, 0.25),
        max_price: quantile(sorted, 0.75),
        recommended_price: quantile(sorted, 0.5),
      }, minILS);
      return new Response(
        JSON.stringify({
          source: "history",
          scope,
          sample_size: prices.length,
          min_price: clamped.min_price,
          max_price: clamped.max_price,
          recommended_price: clamped.recommended_price,
          currency: "ILS",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ============ Priority #2: Gemini Flash fallback ============
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ source: "none", sample_size: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const localeNames: Record<string, string> = {
      en: "English", ru: "Russian", he: "Hebrew", ar: "Arabic",
    };
    const uiLangName = localeNames[userLocale as string] ?? "English";

    const body = {
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `You estimate typical fair-market prices for local service tasks in Israel. Reply in ${uiLangName}. Prices are in ILS (Israeli shekels). Use the function tool to respond.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            city: city || "Israel",
            category: category || "general",
            title: title || "",
            description: description || "",
          }),
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "estimate_price",
            description: "Return a fair-market ILS price estimate for the task",
            parameters: {
              type: "object",
              properties: {
                min_price: { type: "number" },
                max_price: { type: "number" },
                recommended_price: { type: "number" },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
              },
              required: ["min_price", "max_price", "recommended_price", "confidence"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "estimate_price" } },
      stream: false,
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      return new Response(JSON.stringify({ source: "none", sample_size: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      return new Response(JSON.stringify({ source: "none", sample_size: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(args);
    const minILS = await getMinILS();
    const clamped = clampEstimateILS(parsed, minILS);
    return new Response(
      JSON.stringify({
        source: "ai",
        scope: "ai",
        sample_size: 0,
        min_price: clamped.min_price,
        max_price: clamped.max_price,
        recommended_price: clamped.recommended_price,
        confidence: parsed.confidence,
        currency: "ILS",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("estimate-task-price error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
