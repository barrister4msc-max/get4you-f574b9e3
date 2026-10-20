import { describe, expect, it } from "vitest";
import { publicSourceUrl, searchEvidence, openAIStreamFailure } from "../../supabase/functions/_shared/searchEvidence";
describe("native search evidence", () => {
  it("preserves OpenAI credit exhaustion inside a successful HTTP stream as a terminal billing failure", () => {
    expect(openAIStreamFailure({ type: "error", error: { type: "insufficient_quota", code: "credit_balance_exhausted" } })).toEqual({ status: 402, reason: "openai:credit_balance_exhausted" });
  });
  it("does not treat model-written links as search sources", () => {
    expect(searchEvidence([{ type: "message", content: [{ text: "https://invented.example/price" }] }]).sources).toEqual([]);
  });
  it("retains completed real search sources and queries", () => {
    expect(searchEvidence([{ type: "web_search_call", status: "completed", action: { query: "ניקיון חיפה", sources: [{ url: "https://prices.example/cleaning" }] } }])).toMatchObject({ queries: ["ניקיון חיפה"], sources: [{ url: "https://prices.example/cleaning" }] });
  });
  it("rejects local, numeric and credential-bearing source URLs", () => {
    for (const url of ["https://127.0.0.1/", "https://localhost/", "http://prices.example/", "https://user:pass@prices.example/", "https://[::1]/"]) expect(publicSourceUrl(url)).toBe(false);
    expect(publicSourceUrl("https://prices.example/list")).toBe(true);
  });
});