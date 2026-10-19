import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { savePendingTaskDraft, readTaskDraft, clearPendingTaskDraft } from "./pendingTaskDraft";
import { resolvePostAuthRedirect } from "./postAuthRedirect";

describe("post-auth task restoration", () => {
  beforeEach(() => localStorage.clear());

  it("returns to the selected cleaning draft without creating a task", async () => {
    savePendingTaskDraft({ category: "cleaning", title: "TEST cleaning", budget: 200, serviceDetails: { area_m2: 50 } });
    const from = vi.fn(() => { throw new Error("No database access expected for pending draft"); });
    const client = { from } as unknown as SupabaseClient;
    expect(await resolvePostAuthRedirect(client, "test-user")).toEqual({ path: "/create-task?continueDraft=1&category=cleaning" });
    expect(from).not.toHaveBeenCalled();
    expect(readTaskDraft("test-user")?.serviceDetails).toEqual({ area_m2: 50 });
  });

  it("clearing a published draft removes both contents and pending flag", () => {
    savePendingTaskDraft({ category: "moving", title: "TEST moving", budget: 200 });
    clearPendingTaskDraft();
    expect(readTaskDraft("test-user")).toBeNull();
    expect(localStorage.getItem("task_draft_pending_submit")).toBeNull();
  });
});