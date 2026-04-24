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
// TODO(backend): replace with `supabase.functions.invoke('release-escrow', ...)`
// Server should: verify caller is the task owner, mark escrow released,
// create payout row, mark task completed — atomically.
// ──────────────────────────────────────────────────────────────────────

export async function releaseEscrow(escrowId: string, taskId: string) {
  // TODO: route through Edge Function `release-escrow`.
  const { error: escrowErr } = await supabase
    .from("escrow_transactions")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
    } as never)
    .eq("id", escrowId);
  if (escrowErr) return { error: escrowErr };

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
  // TODO: route through Edge Function `admin-resolve-dispute` (favor=tasker).
  const { error: escrowErr } = await supabase
    .from("escrow_transactions")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
    } as never)
    .eq("id", escrowId);
  if (escrowErr) return { error: escrowErr };

  const { error: taskErr } = await supabase
    .from("tasks")
    .update({ status: "completed" })
    .eq("id", taskId);
  return { error: taskErr ?? null };
}
