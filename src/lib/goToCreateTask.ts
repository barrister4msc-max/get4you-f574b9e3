import type { NavigateFunction } from "react-router-dom";
import { rememberPostAuthReturnTo } from "./postAuthRedirect";

/**
 * Single entry-point for every "Post a task" / "Чем помочь?" CTA.
 *
 *   - Authed users go straight to /create-task.
 *   - Guests are redirected to signup with returnTo=/create-task so that
 *     after auth they land back on the wizard (and any pending draft is
 *     auto-published by resolvePostAuthRedirect).
 *
 * Never navigate to /profile or /auth/callback from here — CreateTask
 * is the only page that owns the publish flow.
 */
export function goToCreateTask(
  navigate: NavigateFunction,
  opts: { isAuthenticated: boolean; from?: string } = { isAuthenticated: false },
) {
  const target = "/create-task";
  try {
    if (!opts.isAuthenticated) rememberPostAuthReturnTo(target);
  } catch {
    /* ignore */
  }
  if (opts.isAuthenticated) {
    navigate(target);
    return;
  }
  navigate(`/login?tab=signup&returnTo=${encodeURIComponent(target)}`);
}