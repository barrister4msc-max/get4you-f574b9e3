import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSignatureString, getApiSignatureAsync } from "./signature.ts";

const API_KEY = "test-api-key";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test("sign field is excluded from signature", () => {
  const withSign = buildSignatureString(
    { a: "alpha", sign: "should-be-ignored", b: "beta" },
    API_KEY,
  );
  const withoutSign = buildSignatureString(
    { a: "alpha", b: "beta" },
    API_KEY,
  );
  assertEquals(withSign, withoutSign);
  assert(!withSign.includes("should-be-ignored"));
});

Deno.test("string fields are included in alphabetical key order", () => {
  const sig = buildSignatureString(
    { merchant: "M1", order_id: "ORD-42", currency: "ILS" },
    API_KEY,
  );
  // Keys sorted: currency, merchant, order_id
  assertEquals(sig, `ILS:M1:ORD-42:${API_KEY}`);
});

Deno.test("numeric amount/status/inst are stringified into the signature", () => {
  const sig = buildSignatureString(
    { amount: 199.5, status: 2, inst: 1 },
    API_KEY,
  );
  // Sorted keys: amount, inst, status
  assertEquals(sig, `199.5:1:2:${API_KEY}`);
});

Deno.test("numeric 0 is preserved (not treated as empty)", () => {
  const sig = buildSignatureString(
    { amount: 0, status: 0, inst: 0, order_id: "ORD-1" },
    API_KEY,
  );
  // Sorted: amount, inst, order_id, status
  assertEquals(sig, `0:0:ORD-1:0:${API_KEY}`);
  assertStringIncludes(sig, "0:0:");
});

Deno.test("items as JSON string is signed as raw string, not parsed", () => {
  const itemsJson = '[{"name":"Task","price":50}]';
  const sig = buildSignatureString(
    { amount: 50, items: itemsJson, order_id: "ORD-7" },
    API_KEY,
  );
  // Sorted: amount, items, order_id. items kept as raw JSON string.
  assertEquals(sig, `50:${itemsJson}:ORD-7:${API_KEY}`);
});

Deno.test("empty values are excluded (empty string, whitespace, null, undefined, NaN)", () => {
  const sig = buildSignatureString(
    {
      a: "alpha",
      blank: "",
      whitespace: "   ",
      none: null,
      missing: undefined,
      nan: Number.NaN,
      z: "zeta",
    },
    API_KEY,
  );
  assertEquals(sig, `alpha:zeta:${API_KEY}`);
});

Deno.test("getApiSignatureAsync returns sha256 hex of buildSignatureString", async () => {
  const params = { amount: 10, order_id: "X", items: '[{"n":1}]' };
  const expected = await sha256Hex(buildSignatureString(params, API_KEY));
  const actual = await getApiSignatureAsync(params, API_KEY);
  assertEquals(actual, expected);
  assertEquals(actual.length, 64);
});