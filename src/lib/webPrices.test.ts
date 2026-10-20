import { describe, expect, it } from "vitest";
import { aggregate, isVerified, normalizeCleaning, type RawOffer } from "../../supabase/functions/_shared/webPrices";

const o = (x: Partial<RawOffer>): RawOffer => ({ url: "https://a.example", quote: "", price: 0, unit: "per_m2", cleaningType: "after_renovation",
  priceMax: null, areaMin: null, areaMax: null, isFromPrice: false, includesWindows: null, vatNote: null, ...x });
const spec = { areaM2: 80, cleaningType: "after_renovation" as const, windows: null };

describe("web price rules", () => {
  it("recommended is the midpoint of the lowest and highest applicable price", () => {
    const a = [o({ price: 10, quote: "10" }), o({ price: 15, quote: "15" }), o({ price: 25, quote: "25" })].map((x) => normalizeCleaning(x, spec, null)[0]);
    const r = aggregate(a, "city", "חיפה", "2026-10-20");
    expect(r).toMatchObject({ status: "available", min: 800, max: 2000, recommended: 1400 });
  });
  it("rounds the midpoint to a whole shekel", () => {
    const r = aggregate([{ normalized: 801 }, { normalized: 1000 }].map((x) => ({ url: "", quote: "", unit: "per_m2" as const, unitPrice: 0, calc: "", isFromPrice: false, ...x })), "city", "x", "d");
    expect(r).toMatchObject({ recommended: 901 });
  });
  it("hourly and per-room prices are not converted", () => {
    expect(normalizeCleaning(o({ unit: "per_hour", price: 60 }), spec, null)).toEqual([]);
    expect(normalizeCleaning(o({ unit: "per_room_job", price: 1200 }), spec, null)).toEqual([]);
  });
  it("a different cleaning type is rejected", () => {
    expect(normalizeCleaning(o({ cleaningType: "regular", price: 10 }), spec, null)).toEqual([]);
  });
  it("a single 'from' price gives no estimate", () => {
    const a = normalizeCleaning(o({ price: 12, isFromPrice: true }), spec, null)[0];
    expect(aggregate([a], "city", "x", "d").status).toBe("unavailable");
  });
  it("equal prices give one price, no artificial spread", () => {
    const a = [o({ price: 10 }), o({ price: 10 })].map((x) => normalizeCleaning(x, spec, null)[0]);
    expect(aggregate(a, "city", "x", "d")).toMatchObject({ min: 800, max: 800, recommended: 800 });
  });
  it("a quote not found on the page is not a source", () => {
    expect(isVerified(o({ price: 450, quote: "מ-450 ₪" }), "ניקיון בחיפה מ-450 ₪ לדירה")).toBe(true);
    expect(isVerified(o({ price: 450, quote: "מ-450 ₪" }), "ניקיון בחיפה 500 ₪")).toBe(false);
  });
  it("windows requested but not priced → offer dropped; priced → added", () => {
    const w = { ...spec, windows: 4 };
    expect(normalizeCleaning(o({ price: 10 }), w, null)).toEqual([]);
    expect(normalizeCleaning(o({ price: 10 }), w, 30)[0].normalized).toBe(920);
  });
});

describe("ranges and rooms", () => {
  it("a stated range contributes both ends; rooms price counts only with stated m²", () => {
    const deep = { areaM2: 60, cleaningType: "deep" as const, windows: null };
    const r = normalizeCleaning(o({ unit: "per_room_job", cleaningType: "deep", price: 900, priceMax: 1600, areaMax: 65 }), deep, null);
    expect(r.map((x) => x.normalized)).toEqual([900, 1600]);
    expect(normalizeCleaning(o({ unit: "per_room_job", cleaningType: "deep", price: 900 }), deep, null)).toEqual([]);
  });
});
