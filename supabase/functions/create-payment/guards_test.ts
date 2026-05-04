import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkTaskPayable,
  checkEscrowFree,
  checkNoPaidOrder,
  detectOrphanedEscrow,
} from "./guards.ts";

Deno.test("checkTaskPayable: open task passes", () => {
  const r = checkTaskPayable({ status: "open" });
  assertEquals(r.ok, true);
});

Deno.test("checkTaskPayable: missing task → 404", () => {
  const r = checkTaskPayable(null);
  assert(!r.ok && r.status === 404);
});

Deno.test("checkTaskPayable: in_progress → 409 (no re-payment)", () => {
  const r = checkTaskPayable({ status: "in_progress" });
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.status, 409);
    assertEquals(r.body.error, "Task is no longer payable");
  }
});

Deno.test("checkTaskPayable: completed → 409", () => {
  const r = checkTaskPayable({ status: "completed" });
  assert(!r.ok && r.status === 409);
});

Deno.test("checkEscrowFree: held escrow blocks duplicate payment", () => {
  const r = checkEscrowFree({ id: "e1", status: "held" });
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.status, 409);
    assertEquals(r.body.escrow_id, "e1");
  }
});

Deno.test("checkEscrowFree: released escrow blocks duplicate payment", () => {
  const r = checkEscrowFree({ id: "e2", status: "released" });
  assert(!r.ok && r.status === 409);
});

Deno.test("checkEscrowFree: no escrow passes", () => {
  assertEquals(checkEscrowFree(null).ok, true);
});

Deno.test("checkNoPaidOrder: paid order blocks re-payment", () => {
  const r = checkNoPaidOrder({ id: "o1" });
  assert(!r.ok && r.status === 409);
});

Deno.test("detectOrphanedEscrow: released without payout = orphan", () => {
  assertEquals(detectOrphanedEscrow({ status: "released" }, null), true);
});

Deno.test("detectOrphanedEscrow: released with payout = not orphan (no duplicate)", () => {
  assertEquals(
    detectOrphanedEscrow({ status: "released" }, { id: "p1" }),
    false,
  );
});

Deno.test("detectOrphanedEscrow: held without payout = not orphan yet", () => {
  assertEquals(detectOrphanedEscrow({ status: "held" }, null), false);
});