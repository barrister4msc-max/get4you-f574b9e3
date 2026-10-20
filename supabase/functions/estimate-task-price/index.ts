import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import {
  computeHistory, computeTariff, findTariff, type ComparableRecord, type EstimateParams, type EstimateResult,
} from "../_shared/priceEstimate.ts";
import { researchCleaning, ResearchError } from "./webResearch.ts";
import type { CleaningType } from "../_shared/webPrices.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Services whose price depends on area; history without area is not comparable for them.
const AREA_SERVICES = new Set(["cleaning"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (r: EstimateResult | Record<string, unknown>, status = 200) =>
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
    if (b.additional_work === true) return reply({ status: "unavailable", reason: "additional_work_requires_quote" });
    if (p.areaM2 !== null && p.areaM2 !== undefined && (p.areaM2 <= 0 || p.areaM2 > 5000)) return reply({ status: "error", reason: "invalid_area" }, 400);
    if (p.windows !== null && p.windows !== undefined && (!Number.isInteger(p.windows) || p.windows < 1 || p.windows > 200)) return reply({ status: "error", reason: "invalid_windows" }, 400);
    if (!p.cityId) return reply({ status: "unavailable", reason: "city_required" });

    // 1) Confirmed tariff (none registered yet).
    const tariff = findTariff(p);
    if (tariff) return reply(computeTariff(tariff, p));

    // 2) Verified public internet prices (city, then its region). Only the
    //    public city name is sent out — never the address.
    const cityHe = typeof b?.city_name_he === "string" ? b.city_name_he.trim().slice(0, 60) : "";
    const types = ["regular", "deep", "after_renovation", "move_in_out"];
    if (service === "cleaning" && cityHe && p.areaM2 && p.areaM2 > 0 && p.subtype && types.includes(p.subtype)) {
      try {
        const from = b?.start_scope === "region" || b?.start_scope === "country" ? b.start_scope : undefined;
        const web = await researchCleaning(cityHe, { areaM2: p.areaM2, cleaningType: p.subtype as CleaningType, windows: p.windows ?? null }, from);
        return reply(web);
      } catch (e) {
        console.warn("[prices] web research failed", e instanceof Error ? e.message : String(e));
        return reply({ status: "error", reason: e instanceof Error ? e.message : "web_research_failed" }, e instanceof ResearchError ? e.status : 502);
      }
    }
    if (service === "cleaning") return reply({ status: "unavailable", reason: !cityHe ? "city_name_required" : "cleaning_parameters_required" });

    // 3) Completed orders with released payment, same exact category, same city and currency.
    const url = Deno.env.get("SUPABASE_URL");
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !secret) return reply({ status: "error", reason: "storage_not_configured" }, 500);
    const sb = createClient(url, secret);
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
