import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => ({ callbacks: new Map<string, (p: { old: { id: string } }) => void>() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { channel: () => {
  const channel = {
    on: (_: string, config: { event: string }, callback: (p: { old: { id: string } }) => void) => { realtime.callbacks.set(config.event, callback); return channel; },
    subscribe: vi.fn(),
  };
  return channel;
} } }));

import { announceTaskRemoved, isTaskRemoved, withoutRemoved, useTaskSyncTick } from "./taskLiveSync";

describe("removed task convergence (synthetic IDs only)", () => {
  beforeEach(() => vi.useRealTimers());

  it("late list responses cannot restore a removed task", () => {
    announceTaskRemoved("TEST-removed-late");
    expect(withoutRemoved([{ id: "TEST-removed-late" }, { id: "TEST-current" }])).toEqual([{ id: "TEST-current" }]);
  });

  it("notifications referencing a removed task are excluded", () => {
    announceTaskRemoved("TEST-removed-notice");
    expect(withoutRemoved([{ id: "notice", task_id: "TEST-removed-notice" }])).toEqual([]);
  });

  it("a database delete event updates active subscribers and blocks the ID", () => {
    const { result } = renderHook(() => useTaskSyncTick());
    const previous = result.current;
    const callback = realtime.callbacks.get("DELETE");
    expect(callback).toBeDefined();
    act(() => callback?.({ old: { id: "TEST-realtime-deleted" } }));
    expect(result.current).toBeGreaterThan(previous);
    expect(isTaskRemoved("TEST-realtime-deleted")).toBe(true);
  });

  it("returning to the page requests a refresh", () => {
    const { result } = renderHook(() => useTaskSyncTick());
    const previous = result.current;
    act(() => window.dispatchEvent(new Event("pageshow")));
    expect(result.current).toBeGreaterThan(previous);
  });
});