import { describe, it, expect } from "vitest";
import {
  computeTariff, computeHistory, findTariff, parseEstimateResponse, estimateKey, TARIFFS,
  type Tariff, type EstimateParams, type ComparableRecord,
} from "../../supabase/functions/_shared/priceEstimate";

// Synthetic tariff: TEST FIXTURE ONLY.
const T: Tariff = { id: "fixture", version: "t1", service: "cleaning", currency: "ILS", base: 100, pricePerM2: 5, pricePerWindow: 20, minimum: 300 };
const P = (o: Partial<EstimateParams> = {}): EstimateParams => ({ service: "cleaning", currency: "ILS", areaM2: 100, ...o });
const total = (r: ReturnType<typeof computeTariff>) => (r.status === "available" && r.method === "tariff" ? r.total : NaN);

describe("tariff", () => {
  it("100 vs 200 m² follows the tariff model exactly", () => {
    expect(total(computeTariff(T, P({ areaM2: 100 })))).toBe(600);
    expect(total(computeTariff(T, P({ areaM2: 200 })))).toBe(1100);
  });
  it("199/200/201 m² change by one m² rate, no jumps", () => {
    const [a, b, c] = [199, 200, 201].map((m) => total(computeTariff(T, P({ areaM2: m }))));
    expect(b - a).toBe(5); expect(c - b).toBe(5);
  });
  it("each extra counted once", () => {
    const r = computeTariff(T, P({ windows: 3 }));
    expect(total(r)).toBe(660);
    if (r.status === "available" && r.method === "tariff") expect(r.provenance.components.filter((c) => c.label === "windows")).toHaveLength(1);
  });
  it("minimum applied once, not added", () => {
    const r = computeTariff(T, P({ areaM2: 10 }));
    expect(total(r)).toBe(300);
    if (r.status === "available" && r.method === "tariff") expect(r.provenance.minimumApplied).toBe(true);
  });
  it("tariff limited to an area does not extend beyond it", () => {
    expect(computeTariff({ ...T, maxAreaM2: 100 }, P({ areaM2: 200 })).status).toBe("unavailable");
  });
  it("currency and major units preserved (600 ILS stays 600)", () => {
    const r = computeTariff(T, P());
    expect(r.status === "available" && r.currency).toBe("ILS");
    expect(total(r)).toBe(600);
    expect(computeTariff(T, P({ currency: "USD" })).status).toBe("unavailable");
  });
  it("no production tariffs → none found", () => {
    expect(TARIFFS).toHaveLength(0);
    expect(findTariff(P())).toBeNull();
  });
});

describe("history", () => {
  const rec = (amount: number, areaM2: number | null, currency = "ILS"): ComparableRecord => ({ amount, currency, areaM2 });
  it("records without area are not comparable for area services", () => {
    expect(computeHistory(Array(10).fill(rec(500, null)), P(), true).status).toBe("unavailable");
  });
  it("too few comparable → unavailable", () => {
    expect(computeHistory([rec(500, 100), rec(600, 100)], P(), true).status).toBe("unavailable");
  });
  it("other area / currency excluded", () => {
    const r = [...Array(5).fill(rec(500, 300)), ...Array(5).fill(rec(500, 100, "USD"))];
    expect(computeHistory(r, P(), true).status).toBe("unavailable");
  });
  it("comparable records give quartiles with real sample size", () => {
    const r = computeHistory([400, 500, 600, 700, 800].map((a) => rec(a, 100)), P(), true);
    expect(r).toMatchObject({ status: "available", method: "history", min: 500, recommended: 600, max: 700, provenance: { sampleSize: 5 } });
  });
});

describe("contract", () => {
  it("unavailable/error carry no money", () => {
    expect(parseEstimateResponse({ status: "unavailable", reason: "x", total: 999 })).toEqual({ status: "unavailable", reason: "x" });
    expect(parseEstimateResponse({ status: "error", reason: "y", min: 1 })).toEqual({ status: "error", reason: "y" });
  });
  it("legacy/malformed payloads become error (no AI fallback price)", () => {
    expect(parseEstimateResponse({ source: "ai", recommended_price: 400 }).status).toBe("error");
    expect(parseEstimateResponse(null).status).toBe("error");
    expect(parseEstimateResponse({ status: "available", method: "history", currency: "ILS", provenance: {}, min: 700, recommended: 500, max: 900 }).status).toBe("error");
  });
  it("key changes with area, subtype, windows, city, currency", () => {
    const k = estimateKey(P());
    for (const o of [{ areaM2: 101 }, { subtype: "deep" }, { windows: 2 }, { cityId: "osm:R1" }, { neighborhoodId: "osm:N2" }, { currency: "USD" }]) expect(estimateKey(P(o))).not.toBe(k);
  });
});
