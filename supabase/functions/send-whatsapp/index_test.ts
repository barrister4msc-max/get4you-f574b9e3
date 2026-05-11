import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/send-whatsapp`;

async function call(body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

// All tests assert NEGATIVE paths only — no real WhatsApp is ever sent.

Deno.test("rejects unauthenticated calls (no JWT, no internal-secret)", async () => {
  const { status } = await call({ type: "tasker_hired", task_id: "x", phone: "+10000000000" });
  assertEquals(status, 401);
});

Deno.test("rejects admin_broadcast attempted via internal-secret only", async () => {
  // Wrong secret → still treated as non-internal → 401 at auth layer.
  const { status } = await call(
    { type: "admin_broadcast", phones: ["+10000000000"], message: "x" },
    { "x-internal-secret": "definitely-wrong-value" },
  );
  // Either 401 (auth) or 403 (admin gate) is acceptable; both prove the
  // call did not reach Twilio.
  if (status !== 401 && status !== 403) {
    throw new Error(`expected 401 or 403, got ${status}`);
  }
});

Deno.test("rejects unknown type with 401 (auth fails first) — no Twilio call", async () => {
  const { status } = await call({ type: "totally_made_up_type" });
  assertEquals(status, 401);
});

Deno.test("alias payment_success collapses to tasker_hired (gated by auth)", async () => {
  // Without auth, even alias must 401 — confirms alias does not bypass auth.
  const { status } = await call({ type: "payment_success", task_id: "x", phone: "+10000000000" });
  assertEquals(status, 401);
});

Deno.test("alias proposal_accepted collapses to tasker_hired (gated by auth)", async () => {
  const { status } = await call({ type: "proposal_accepted", task_id: "x", phone: "+10000000000" });
  assertEquals(status, 401);
});

Deno.test("rejects new_proposal without auth", async () => {
  const { status } = await call({ type: "new_proposal", task_id: "x", phone: "+10000000000" });
  assertEquals(status, 401);
});