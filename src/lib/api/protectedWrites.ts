/**
 * Protected writes wrapper.
 *
 * Critical tables (`user_roles`, `banned_users`, `orders`,
 * `escrow_transactions`, `payouts`) must NOT be written directly
 * from the frontend. All mutations should go through Supabase Edge
 * Functions so business rules, audit logging, and authorization
 * can be enforced server-side.
 *
 * Where an Edge Function already exists (`manage-admin`, `manage-user`),
 * UI code should call it via `supabase.functions.invoke`.
 *
 * The helpers below are TODO wrappers for flows where no dedicated
 * Edge Function exists yet. They preserve current behavior (direct
 * writes) so the UI keeps working, but centralize the call sites so
 * we can swap them to `functions.invoke(...)` once the backend lands.
 *
 * DO NOT add new direct writes in components — extend this module
 * (and later the matching Edge Function) instead.
 */
import { supabase } from "@/integrations/supabase/client";

// ──────────────────────────────────────────────────────────────────────
// Self-service role management
// TODO(backend): replace with `supabase.functions.invoke('manage-self-role', ...)`
// Current behavior relies on RLS policy that lets a user insert/delete
// their own client/executor role row.
// ──────────────────────────────────────────────────────────────────────

export type SelfRole = "client" | "executor";

export async function addSelfRole(userId: string, role: SelfRole) {
  // TODO: route through Edge Function once `manage-self-role` is deployed.
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role: role as never });
  return { error };
}

export async function removeSelfRole(userId: string, role: SelfRole) {
  // TODO: route through Edge Function once `manage-self-role` is deployed.
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role as never);
  return { error };
}

// ──────────────────────────────────────────────────────────────────────
// Escrow release (task completion by client)
// Routes through Supabase Edge Function `release-escrow`, which validates
// the escrow, blocks release when an open dispute exists, marks the
// escrow released, creates the payout row, and writes an audit event.
// The task `status` update remains here so the calling UI flow is
// unchanged.
// ──────────────────────────────────────────────────────────────────────

export async function releaseEscrow(escrowId: string, taskId: string) {
  const { data, error: invokeErr } = await supabase.functions.invoke(
    "release-escrow",
    { body: { escrow_id: escrowId } },
  );
  if (invokeErr) return { error: invokeErr };
  if (data && typeof data === "object" && "error" in data && data.error) {
    return { error: new Error(String((data as { error: unknown }).error)) };
  }

  const { error: taskErr } = await supabase
    .from("tasks")
    .update({ status: "completed" })
    .eq("id", taskId);
  return { error: taskErr ?? null };
}

// ──────────────────────────────────────────────────────────────────────
// Admin dispute resolution
// Existing DB RPCs `admin_resolve_dispute_refund` /
// `admin_resolve_dispute_release` already encapsulate the logic, but
// AdminDisputes.tsx currently does table updates directly. Use this
// wrapper as the single choke-point.
// TODO(backend): wrap the RPCs in an `admin-resolve-dispute` Edge Function
// so we can layer audit logging + email notifications.
// ──────────────────────────────────────────────────────────────────────

export async function adminRefundEscrow(escrowId: string, taskId: string) {
  // TODO: route through Edge Function `admin-resolve-dispute` (favor=client).
  const { error: escrowErr } = await supabase
    .from("escrow_transactions")
    .update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
    } as never)
    .eq("id", escrowId);
  if (escrowErr) return { error: escrowErr };

  const { error: taskErr } = await supabase
    .from("tasks")
    .update({ status: "cancelled" })
    .eq("id", taskId);
  return { error: taskErr ?? null };
}

export async function adminReleaseEscrow(escrowId: string, taskId: string) {
  // Reuses the `release-escrow` Edge Function. A dedicated
  // `admin-resolve-dispute` function can wrap this later for full audit.
  const { data, error: invokeErr } = await supabase.functions.invoke(
    "release-escrow",
    { body: { escrow_id: escrowId } },
  );
  if (invokeErr) return { error: invokeErr };
  if (data && typeof data === "object" && "error" in data && data.error) {
    return { error: new Error(String((data as { error: unknown }).error)) };
  }

  const { error: taskErr } = await supabase
    .from("tasks")
    .update({ status: "completed" })
    .eq("id", taskId);
  return { error: taskErr ?? null };
}

// ──────────────────────────────────────────────────────────────────────
// Disputes
// `openDispute` calls the `open-dispute` Edge Function which atomically
// validates the participant, locks the related escrow if held, creates
// the dispute row and writes an audit event.
// `closeDisputeWithoutPayout` is a thin wrapper used by admins to mark
// an open dispute as resolved without moving funds.
// TODO(backend): replace the close path with a dedicated
// `admin-resolve-dispute` Edge Function for full audit logging.
// ──────────────────────────────────────────────────────────────────────

export async function openDispute(
  assignmentId: string,
  reason: string,
  description?: string,
) {
  const { data, error: invokeErr } = await supabase.functions.invoke(
    "open-dispute",
    { body: { assignment_id: assignmentId, reason, description } },
  );
  if (invokeErr) return { data: null, error: invokeErr };
  if (data && typeof data === "object" && "error" in data && data.error) {
    return {
      data: null,
      error: new Error(String((data as { error: unknown }).error)),
    };
  }
  return { data, error: null };
}

export async function closeDisputeWithoutPayout(
  disputeId: string,
  note?: string,
) {
  // TODO: route through Edge Function `admin-resolve-dispute`.
  const { error } = await supabase
    .from("disputes")
    .update({
      status: "resolved",
      resolution_type: "closed_no_payout",
      resolution_note: note ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", disputeId);
  return { error };
}
