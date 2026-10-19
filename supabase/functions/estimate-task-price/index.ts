import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import {
  computeHistory, computeTariff, findTariff, type ComparableRecord, type EstimateParams, type EstimateResult,
} from "../_shared/priceEstimate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Services whose price depends on area; history without area is not comparable for them.
const AREA_SERVICES = new Set(["cleaning"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (r: EstimateResult, status = 200) =>
  new Response(JSON.stringify(r), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const b = await req.json();
    const service = typeof b?.service === "string" ? b.service : "";
    const categoryId = typeof b?.category_id === "string" && UUID.test(b.category_id) ? b.category_id : null;
    const currency = typeof b?.currency === "string" ? b.currency.toUpperCase() : "";
    if (!service || !categoryId || !/^[A-Z]{3}$/.test(currency)) return reply({ status: "unavailable", reason: "missing_service_or_currency" });

    const p: EstimateParams = {
      service, currency,
      subtype: typeof b?.subtype === "string" && b.subtype ? b.subtype : null,
      areaM2: num(b?.area_m2), windows: num(b?.windows),
      cityId: typeof b?.city_id === "string" && /^osm:[RNW][0-9]+$/.test(b.city_id) ? b.city_id : null,
      neighborhoodId: typeof b?.neighborhood_id === "string" && /^osm:[RNW][0-9]+$/.test(b.neighborhood_id) ? b.neighborhood_id : null,
    };
    if (!p.cityId) return reply({ status: "unavailable", reason: "city_required" });

    // 1) Confirmed tariff (none registered yet).
    const tariff = findTariff(p);
    if (tariff) return reply(computeTariff(tariff, p));

    // 2) Completed orders with released payment, same exact category, same city and currency.
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let q = sb.from("tasks")
      .select("city, service_details, escrow_transactions!inner(amount, currency, status)")
      .eq("status", "completed").eq("category_id", categoryId)
      .eq("escrow_transactions.status", "released").limit(1000);
    q = q.eq("city_id", p.cityId); // same normalized city; neighborhood is not used as a filter yet
    const { data, error } = await q;
    if (error) {
      console.error("estimate history query failed", error.message);
      return reply({ status: "error", reason: "history_unavailable" }, 502);
    }
    const records: ComparableRecord[] = [];
    for (const row of (data ?? []) as Array<{ service_details: Record<string, unknown> | null; escrow_transactions: Array<{ amount: number; currency: string }> }>) {
      const sd = row.service_details ?? {};
      for (const e of row.escrow_transactions ?? []) {
        records.push({ amount: Number(e.amount), currency: String(e.currency).toUpperCase(),
          areaM2: num(sd.area_m2), subtype: typeof sd.cleaning_type === "string" ? sd.cleaning_type : null });
      }
    }
    return reply(computeHistory(records, p, AREA_SERVICES.has(service)));
  } catch (e) {
    console.error("estimate-task-price error:", e);
    return reply({ status: "error", reason: "internal" }, 500);
  }
});
