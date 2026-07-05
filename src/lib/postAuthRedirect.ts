import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTaskFromPendingDraft,
  hasPendingTaskDraft,
} from "./pendingTaskDraft";

const RETURN_TO_KEY = "post_auth_return_to";

const isSafePath = (p: string | null | undefined): p is string => {
  if (!p) return false;
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  if (p === "/login" || p === "/signup" || p.startsWith("/auth/callback"))
    return false;
  return true;
};

export const rememberPostAuthReturnTo = (path: string | null | undefined) => {
  try {
    if (isSafePath(path)) localStorage.setItem(RETURN_TO_KEY, path);
    else localStorage.removeItem(RETURN_TO_KEY);
  } catch {
    /* ignore */
  }
};

export const consumePostAuthReturnTo = (): string | null => {
  try {
    const v = localStorage.getItem(RETURN_TO_KEY);
    localStorage.removeItem(RETURN_TO_KEY);
    return isSafePath(v) ? v : null;
  } catch {
    return null;
  }
};

export type PostAuthRedirect = { path: string };

/**
 * Single source of truth for "where do we send the user after a successful
 * auth flow" (email signup confirmation, email login, Google OAuth, Apple
 * OAuth). Order of priority:
 *   1. Pending task draft from a pre-auth marketplace flow -> create it and
 *      go to the created task page.
 *   2. Missing phone / WhatsApp consent decision -> /profile?onboarding=1.
 *   3. Explicit returnTo passed by the caller (query param) if safe.
 *   4. Dashboard.
 */
export async function resolvePostAuthRedirect(
  supabase: SupabaseClient,
  userId: string,
  opts: { returnTo?: string | null } = {}
): Promise<PostAuthRedirect> {
  // 1) Pending task draft
  if (hasPendingTaskDraft()) {
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("preferred_currency")
        .eq("user_id", userId)
        .maybeSingle();
      const taskId = await createTaskFromPendingDraft({
        userId,
        currency: (prof as any)?.preferred_currency || "ILS",
      });
      if (taskId) return { path: `/tasks/${taskId}` };
      return { path: "/dashboard" };
    } catch (e) {
      console.error("[postAuth] draft creation failed", e);
      // fall through to onboarding/dashboard
    }
  }

  // 2) Onboarding gate: phone + WhatsApp decision
  //    Skip the gate when the user was on their way to /create-task so we
  //    never bounce a Client to /profile mid-flow. Phone is only required
  //    at publish time (handled inside CreateTask).
  const returnCandidate = opts.returnTo || (() => {
    try { return localStorage.getItem("post_auth_return_to"); } catch { return null; }
  })();
  const goingToCreateTask =
    typeof returnCandidate === "string" && returnCandidate.startsWith("/create-task");

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, whatsapp_phone, whatsapp_opt_in, whatsapp_opt_in_at")
    .eq("user_id", userId)
    .maybeSingle();
  const p: any = profile || {};
  const hasPhone = !!(p.phone || p.whatsapp_phone);
  const hasDecidedWa = p.whatsapp_opt_in_at != null || p.whatsapp_opt_in === true;
  if ((!hasPhone || !hasDecidedWa) && !goingToCreateTask) {
    return { path: "/profile?onboarding=1" };
  }

  // 2b) Tasker onboarding gate: if the user has a worker role but no
  //     tasker_service_categories yet, send them through the wizard.
  try {
    const { data: rolesRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleList = (rolesRows ?? []).map((r: any) => r.role);
    const isTasker = roleList.includes("executor") || roleList.includes("tasker");
    if (isTasker && !goingToCreateTask) {
      const { count } = await (supabase.from("tasker_service_categories" as any) as any)
        .select("user_id", { head: true, count: "exact" })
        .eq("user_id", userId);
      if (!count || count === 0) {
        return { path: "/onboarding/tasker" };
      }
    }
  } catch (e) {
    console.warn("[postAuth] tasker onboarding gate failed", e);
  }

  // 3) Explicit returnTo
  const stored = consumePostAuthReturnTo();
  const candidate = opts.returnTo || stored;
  if (isSafePath(candidate)) return { path: candidate! };

  // 4) Default
  return { path: "/dashboard" };
}