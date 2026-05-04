// Pure, framework-free guard helpers for create-payment.
// Extracted so they can be exercised directly in Deno tests
// without spinning up Supabase / Allpay.

export const PAYABLE_TASK_STATUSES = ["draft", "open", "awaiting_payment"] as const;
export const BLOCKING_ESCROW_STATUSES = ["held", "released", "refunded"] as const;

export type GuardResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

/** Block payments when the task is no longer in a payable state. */
export function checkTaskPayable(task: { status?: string | null } | null): GuardResult {
  if (!task) {
    return { ok: false, status: 404, body: { error: "Task not found" } };
  }
  if (task.status && !PAYABLE_TASK_STATUSES.includes(String(task.status) as never)) {
    return {
      ok: false,
      status: 409,
      body: { error: "Task is no longer payable", task_status: task.status },
    };
  }
  return { ok: true };
}

/** Block double-funding: any blocking escrow row means the task already paid. */
export function checkEscrowFree(
  existingEscrow: { id: string; status: string } | null,
): GuardResult {
  if (existingEscrow) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "This task has already been funded",
        escrow_id: existingEscrow.id,
        escrow_status: existingEscrow.status,
      },
    };
  }
  return { ok: true };
}

/** Block re-payment of an already-paid order for same proposal. */
export function checkNoPaidOrder(
  paidOrder: { id: string } | null,
): GuardResult {
  if (paidOrder) {
    return {
      ok: false,
      status: 409,
      body: { error: "This proposal has already been paid", order_id: paidOrder.id },
    };
  }
  return { ok: true };
}

/** Detect orphaned escrow: a released escrow with no payout row → recoverable. */
export function detectOrphanedEscrow(
  escrow: { status: string } | null,
  payout: { id: string } | null,
): boolean {
  return !!escrow && escrow.status === "released" && !payout;
}