import { describe, it, expect } from "vitest";
import {
  computeTariff, computeHistory, findTariff, parseEstimateResponse, estimateKey, TARIFFS, estimateConversionRate, convertEstimateAmount,
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
  it("owner tariff: regular cleaning 500–700 ₪, recommended 600", () => {
    const r = computeTariff(findTariff(P({ subtype: "regular" }))!, P({ subtype: "regular" }));
    expect(r.status === "available" && r.method === "tariff" && [r.min, r.max, r.total]).toEqual([500, 700, 600]);
  });
  it("owner tariff: deep cleaning 500–700 ₪ for 100 m²", () => {
    const r = computeTariff(findTariff(P({ subtype: "deep" }))!, P({ subtype: "deep" }));
    expect(r.status === "available" && r.method === "tariff" && [r.min, r.max, r.total]).toEqual([500, 700, 600]);
  });
  it("renovation and move-out cleaning do not use the regular cleaning tariff", () => {
    expect(findTariff(P({ subtype: "after_renovation" }))).toBeNull();
    expect(findTariff(P({ subtype: "move_in_out" }))).toBeNull();
    expect(findTariff(P())).toBeNull();
    expect(TARIFFS.every((t) => t.service === "cleaning")).toBe(true);
  });
  it("tariff range survives the wire contract", () => {
    const r = computeTariff(findTariff(P({ subtype: "deep" }))!, P({ subtype: "deep" }));
    expect(parseEstimateResponse(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
});

describe("owner cleaning tariff by area", () => {
  const at = (a: number) => computeTariff(findTariff(P({ subtype: "deep", areaM2: a }))!, P({ subtype: "deep", areaM2: a }));
  it("up to 100 m² is 500–700, rec 600", () => { expect(at(60)).toMatchObject({ min: 500, max: 700, total: 600 }); expect(at(100)).toMatchObject({ min: 500, max: 700, total: 600 }); });
  it("200 m² is 1000–1400, rec 1200", () => { expect(at(200)).toMatchObject({ min: 1000, max: 1400, total: 1200 }); });
  it("150 m² is 750–1050, rec 900", () => { expect(at(150)).toMatchObject({ min: 750, max: 1050, total: 900 }); });
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
  it("only same cleaning type and size are comparable; 100 vs 200 m² differ", () => {
    const mk = (a: number, m: number, t: string) => ({ amount: a, currency: "ILS", areaM2: m, subtype: t });
    const recs = [...[800, 900, 1000, 1100, 1200].map((a) => mk(a, 100, "after_renovation")),
      ...[1600, 1800, 2000, 2200, 2400].map((a) => mk(a, 200, "after_renovation")),
      ...[5000, 5000, 5000, 5000, 5000].map((a) => mk(a, 100, "move_in_out"))];
    const r100 = computeHistory(recs, P({ subtype: "after_renovation", areaM2: 100 }), true);
    const r200 = computeHistory(recs, P({ subtype: "after_renovation", areaM2: 200 }), true);
    expect(r100).toMatchObject({ min: 900, max: 1100, recommended: 1000 });
    expect(r200).toMatchObject({ min: 1800, max: 2200, recommended: 2000 });
  });
  it("recommended is the midpoint of min and max", () => {
    const r = computeHistory([400, 500, 520, 540, 900].map((a) => rec(a, 100)), P(), true);
    expect(r).toMatchObject({ min: 500, max: 540, recommended: 520 });
  });
  it("comparable records give quartiles with real sample size", () => {
    const r = computeHistory([400, 500, 600, 700, 800].map((a) => rec(a, 100)), P(), true);
    expect(r).toMatchObject({ status: "available", method: "history", min: 500, recommended: 600, max: 700, provenance: { sampleSize: 5 } });
  });
});

describe("contract", () => {
  it("converts ILS to USD once using only a verified fresh rate", () => {
    const rate = estimateConversionRate({ rates: { USD: 1, ILS: 4 }, fetchedAt: Date.now() });
    expect(rate).toBe(0.25);
    expect(convertEstimateAmount(1000, rate ?? 0)).toBe(250);
    expect(estimateConversionRate({ rates: { USD: 1, ILS: 3.7 } })).toBeNull();
    expect(estimateConversionRate({ rates: { USD: 1, ILS: 4 }, fetchedAt: Date.now() - 86400001 })).toBeNull();
  });
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
