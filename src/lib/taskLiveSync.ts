import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps every task list consistent after a task is removed or changes status:
 * - realtime DELETE/UPDATE events from the database
 * - other tabs of the same browser (BroadcastChannel)
 * - returning to the tab (visibility/focus)
 * Removed IDs are remembered for the session so a late response of an older
 * request can never put a removed card back on screen.
 */
const removed = new Set<string>();
const listeners = new Set<(reason: "removed" | "changed" | "focus") => void>();
const CHANNEL = "flow4you-tasks-sync";
let bc: BroadcastChannel | null = null;
let started = false;

const notify = (reason: "removed" | "changed" | "focus") => listeners.forEach((l) => l(reason));

const markRemoved = (id: string) => {
  if (!id) return;
  removed.add(id);
  notify("removed");
};

export const isTaskRemoved = (id: string | null | undefined) => !!id && removed.has(id);

/** Filter out removed tasks. Works on rows with `id` or `task_id`. */
export function withoutRemoved<T extends { id?: string; task_id?: string | null }>(rows: T[] | null | undefined): T[] {
  if (!rows) return [];
  if (removed.size === 0) return rows;
  return rows.filter((r) => !isTaskRemoved(r.id) && !isTaskRemoved(r.task_id ?? undefined));
}

/** Call after this tab successfully deleted a task. */
export const announceTaskRemoved = (id: string) => {
  markRemoved(id);
  try { bc?.postMessage({ type: "removed", id }); } catch { /* ignore */ }
};

/** Call after this tab changed a task status (cancel/complete/archive). */
export const announceTaskChanged = (id: string) => {
  notify("changed");
  try { bc?.postMessage({ type: "changed", id }); } catch { /* ignore */ }
};

const start = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => {
      if (e.data?.type === "removed") markRemoved(e.data.id);
      else notify("changed");
    };
  } catch { bc = null; }

  supabase
    .channel("tasks-live-sync")
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, (p) => {
      const id = (p.old as { id?: string })?.id;
      if (id) markRemoved(id);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, () => notify("changed"))
    .subscribe();

  let last = 0;
  const onFocus = () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - last < 2000) return;
    last = now;
    notify("focus");
  };
  document.addEventListener("visibilitychange", onFocus);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onFocus); // back/forward cache
};

/**
 * Returns a counter that increases whenever lists should refetch.
 * Put it in the dependency list of the effect that loads tasks.
 */
export function useTaskSyncTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    start();
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return tick;
}
