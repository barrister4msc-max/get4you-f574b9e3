// End-to-end integration test for the full payment lifecycle.
//
// We don't want to hit real Supabase / Allpay from CI, so we plug an in-memory
// fake into the same guard logic that create-payment, allpay-webhook and
// release-escrow rely on. The flow exercised here is the contract those three
// edge functions share:
//
//   1. create-payment   → inserts an `orders` row, blocks if escrow exists or
//                         a paid order already exists for the proposal.
//   2. allpay-webhook   → marks order paid, creates the `escrow_transactions`
//                         row (held). Idempotent: a second webhook for the
//                         same task+proposal must NOT create a 2nd escrow.
//   3. release-escrow   → flips escrow to `released` and inserts a `payouts`
//                         row. Must be idempotent (no duplicate payout).
//
// After the happy path completes, we re-run create-payment to prove a 2nd
// payment attempt is rejected with 409.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkEscrowFree,
  checkNoPaidOrder,
  checkTaskPayable,
} from "./guards.ts";

// ---------- Tiny in-memory "Supabase" ----------

type Row = Record<string, unknown>;

class FakeDB {
  tables: Record<string, Row[]> = {
    tasks: [],
    proposals: [],
    orders: [],
    escrow_transactions: [],
    payouts: [],
  };

  insert(table: string, row: Row): Row {
    const withId = { id: row.id ?? crypto.randomUUID(), ...row };
    this.tables[table].push(withId);
    return withId;
  }

  update(table: string, match: (r: Row) => boolean, patch: Row): number {
    let n = 0;
    for (const r of this.tables[table]) {
      if (match(r)) {
        Object.assign(r, patch);
        n++;
      }
    }
    return n;
  }

  find(table: string, match: (r: Row) => boolean): Row | null {
    return this.tables[table].find(match) ?? null;
  }

  filter(table: string, match: (r: Row) => boolean): Row[] {
    return this.tables[table].filter(match);
  }
}

// ---------- Flow stubs that mirror the edge functions ----------

type CreatePaymentResult =
  | { ok: true; order_id: string }
  | { ok: false; status: number; body: Record<string, unknown> };

function createPaymentFlow(
  db: FakeDB,
  args: { user_id: string; task_id: string; proposal_id: string },
): CreatePaymentResult {
  const task = db.find("tasks", (r) => r.id === args.task_id) as
    | { id: string; status: string; user_id: string }
    | null;
  const taskGuard = checkTaskPayable(task);
  if (!taskGuard.ok) return taskGuard;

  const blockingEscrow = db.find(
    "escrow_transactions",
    (r) =>
      r.task_id === args.task_id &&
      ["held", "released", "refunded"].includes(String(r.status)),
  ) as { id: string; status: string } | null;
  const escrowGuard = checkEscrowFree(blockingEscrow);
  if (!escrowGuard.ok) return escrowGuard;

  const paidOrder = db.find(
    "orders",
    (r) =>
      r.task_id === args.task_id &&
      r.proposal_id === args.proposal_id &&
      r.status === "paid",
  ) as { id: string } | null;
  const orderGuard = checkNoPaidOrder(paidOrder);
  if (!orderGuard.ok) return orderGuard;

  const inserted = db.insert("orders", {
    user_id: args.user_id,
    task_id: args.task_id,
    proposal_id: args.proposal_id,
    status: "pending",
    amount: 200,
    currency: "ILS",
  });
  return { ok: true, order_id: String(inserted.id) };
}

function webhookPaidFlow(
  db: FakeDB,
  args: { order_id: string },
): { escrow_id: string } {
  const order = db.find("orders", (r) => r.id === args.order_id) as Row;
  db.update("orders", (r) => r.id === args.order_id, { status: "paid" });
  db.update("tasks", (r) => r.id === order.task_id, { status: "in_progress" });

  // Idempotent escrow creation, mirrors allpay-webhook step 9.
  const existing = db.find(
    "escrow_transactions",
    (r) => r.task_id === order.task_id && r.proposal_id === order.proposal_id,
  );
  if (existing) return { escrow_id: String(existing.id) };

  const proposal = db.find("proposals", (r) => r.id === order.proposal_id) as Row;
  const amount = Number(order.amount);
  const commission = Math.round(amount * 0.15 * 100) / 100;
  const escrow = db.insert("escrow_transactions", {
    task_id: order.task_id,
    proposal_id: order.proposal_id,
    client_id: order.user_id,
    tasker_id: proposal.user_id,
    amount,
    commission_amount: commission,
    net_amount: amount - commission,
    currency: "ILS",
    status: "held",
  });
  return { escrow_id: String(escrow.id) };
}

function releaseEscrowFlow(
  db: FakeDB,
  args: { escrow_id: string },
): { payout_id: string | null; already_released: boolean } {
  const escrow = db.find("escrow_transactions", (r) => r.id === args.escrow_id) as Row;
  if (escrow.status === "released") {
    const existing = db.find("payouts", (r) => r.escrow_id === escrow.id) as Row | null;
    return { payout_id: existing ? String(existing.id) : null, already_released: true };
  }
  // Race-safe update guarded by status='held'
  const n = db.update(
    "escrow_transactions",
    (r) => r.id === escrow.id && r.status === "held",
    { status: "released" },
  );
  if (n === 0) return { payout_id: null, already_released: true };

  // Don't create a duplicate payout if one already exists for this escrow
  const dup = db.find("payouts", (r) => r.escrow_id === escrow.id);
  if (dup) return { payout_id: String(dup.id), already_released: false };

  const payout = db.insert("payouts", {
    user_id: escrow.tasker_id,
    task_id: escrow.task_id,
    escrow_id: escrow.id,
    amount: escrow.amount,
    net_amount: escrow.net_amount,
    commission: escrow.commission_amount,
    currency: escrow.currency,
    status: "pending",
  });
  return { payout_id: String(payout.id), already_released: false };
}

// ---------- Fixture ----------

function seed(): { db: FakeDB; taskId: string; proposalId: string; clientId: string } {
  const db = new FakeDB();
  const clientId = "client-1";
  const taskerId = "tasker-1";
  const task = db.insert("tasks", {
    id: "task-1",
    user_id: clientId,
    status: "open",
    title: "Test task",
    currency: "ILS",
  });
  const proposal = db.insert("proposals", {
    id: "prop-1",
    task_id: task.id,
    user_id: taskerId,
    price: 200,
    currency: "ILS",
    status: "pending",
  });
  return {
    db,
    taskId: String(task.id),
    proposalId: String(proposal.id),
    clientId,
  };
}

// ---------- Tests ----------

Deno.test("e2e: full happy path → order, escrow, payout all created exactly once", () => {
  const { db, taskId, proposalId, clientId } = seed();

  // 1. create-payment succeeds
  const r1 = createPaymentFlow(db, {
    user_id: clientId,
    task_id: taskId,
    proposal_id: proposalId,
  });
  assert(r1.ok);
  if (!r1.ok) return;

  // 2. webhook funds escrow
  const { escrow_id } = webhookPaidFlow(db, { order_id: r1.order_id });
  assertEquals(db.tables.escrow_transactions.length, 1);
  assertEquals(db.tables.escrow_transactions[0].status, "held");
  assertEquals(db.tables.tasks[0].status, "in_progress");

  // 3. mark task completed → release escrow
  db.update("tasks", (r) => r.id === taskId, { status: "completed" });
  const rel = releaseEscrowFlow(db, { escrow_id });
  assertEquals(rel.already_released, false);
  assert(rel.payout_id);
  assertEquals(db.tables.escrow_transactions[0].status, "released");
  assertEquals(db.tables.payouts.length, 1);
  assertEquals(db.tables.payouts[0].net_amount, 170);
});

Deno.test("e2e: duplicate webhook does NOT create a second escrow", () => {
  const { db, taskId, proposalId, clientId } = seed();
  const r1 = createPaymentFlow(db, { user_id: clientId, task_id: taskId, proposal_id: proposalId });
  assert(r1.ok);
  if (!r1.ok) return;

  webhookPaidFlow(db, { order_id: r1.order_id });
  webhookPaidFlow(db, { order_id: r1.order_id });
  webhookPaidFlow(db, { order_id: r1.order_id });

  assertEquals(db.tables.escrow_transactions.length, 1);
});

Deno.test("e2e: duplicate release does NOT create a second payout", () => {
  const { db, taskId, proposalId, clientId } = seed();
  const r1 = createPaymentFlow(db, { user_id: clientId, task_id: taskId, proposal_id: proposalId });
  assert(r1.ok);
  if (!r1.ok) return;
  const { escrow_id } = webhookPaidFlow(db, { order_id: r1.order_id });
  db.update("tasks", (r) => r.id === taskId, { status: "completed" });

  const a = releaseEscrowFlow(db, { escrow_id });
  const b = releaseEscrowFlow(db, { escrow_id });
  const c = releaseEscrowFlow(db, { escrow_id });

  assertEquals(a.already_released, false);
  assertEquals(b.already_released, true);
  assertEquals(c.already_released, true);
  assertEquals(db.tables.payouts.length, 1);
});

Deno.test("e2e: re-paying a funded task is blocked with 409", () => {
  const { db, taskId, proposalId, clientId } = seed();
  const r1 = createPaymentFlow(db, { user_id: clientId, task_id: taskId, proposal_id: proposalId });
  assert(r1.ok);
  if (!r1.ok) return;
  webhookPaidFlow(db, { order_id: r1.order_id });

  // Task is now in_progress → checkTaskPayable rejects.
  const r2 = createPaymentFlow(db, { user_id: clientId, task_id: taskId, proposal_id: proposalId });
  assert(!r2.ok);
  if (r2.ok) return;
  assertEquals(r2.status, 409);

  // Even if we forced the task back to "open", the existing held escrow still blocks.
  db.update("tasks", (r) => r.id === taskId, { status: "open" });
  const r3 = createPaymentFlow(db, { user_id: clientId, task_id: taskId, proposal_id: proposalId });
  assert(!r3.ok);
  if (r3.ok) return;
  assertEquals(r3.status, 409);
  assertEquals(r3.body.error, "This task has already been funded");

  // And there should still be exactly one order + one escrow.
  assertEquals(db.tables.orders.length, 1);
  assertEquals(db.tables.escrow_transactions.length, 1);
});

Deno.test("e2e: re-paying after escrow is released is also blocked", () => {
  const { db, taskId, proposalId, clientId } = seed();
  const r1 = createPaymentFlow(db, { user_id: clientId, task_id: taskId, proposal_id: proposalId });
  assert(r1.ok);
  if (!r1.ok) return;
  const { escrow_id } = webhookPaidFlow(db, { order_id: r1.order_id });
  db.update("tasks", (r) => r.id === taskId, { status: "completed" });
  releaseEscrowFlow(db, { escrow_id });

  const r2 = createPaymentFlow(db, { user_id: clientId, task_id: taskId, proposal_id: proposalId });
  assert(!r2.ok);
  if (r2.ok) return;
  assertEquals(r2.status, 409);
});