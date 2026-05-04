import { describe, it, expect, beforeEach } from "vitest";
import {
  slugFromPath,
  buildCanonical,
  getCachedSeo,
  setCachedSeo,
  clearSeoCache,
} from "@/lib/seoUtils";

describe("slugFromPath", () => {
  it("strips leading and trailing slashes", () => {
    expect(slugFromPath("/tel-aviv/")).toBe("tel-aviv");
  });
  it("collapses duplicate slashes", () => {
    expect(slugFromPath("/tel-aviv//cleaning/")).toBe("tel-aviv/cleaning");
    expect(slugFromPath("///services///repair")).toBe("services/repair");
  });
  it("handles root", () => {
    expect(slugFromPath("/")).toBe("");
  });
});

describe("buildCanonical", () => {
  it("normalizes duplicate slashes in canonical_path", () => {
    expect(buildCanonical("//tel-aviv//cleaning/")).toBe(
      "https://4you.ai/tel-aviv/cleaning",
    );
  });
  it("works with bare slug", () => {
    expect(buildCanonical("israel")).toBe("https://4you.ai/israel");
  });
  it("falls back to root when empty", () => {
    expect(buildCanonical("")).toBe("https://4you.ai/");
    expect(buildCanonical(null)).toBe("https://4you.ai/");
  });
});

describe("seoCache", () => {
  beforeEach(() => clearSeoCache());

  it("stores and returns rows", () => {
    setCachedSeo("a", { slug: "a" });
    expect(getCachedSeo("a")).toEqual({ slug: "a" });
  });
  it("caches explicit null (not-found) so we don't refetch", () => {
    setCachedSeo("missing", null);
    expect(getCachedSeo("missing")).toBeNull();
  });
  it("returns undefined for unknown slug", () => {
    expect(getCachedSeo("nope")).toBeUndefined();
  });
});