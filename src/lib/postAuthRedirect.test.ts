import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { savePendingTaskDraft, readTaskDraft, clearPendingTaskDraft, writeTaskDraft } from "./pendingTaskDraft";
import { resolvePostAuthRedirect, rememberPostAuthReturnTo } from "./postAuthRedirect";

describe("post-auth task restoration", () => {
  beforeEach(() => localStorage.clear());

  it("confirmed publish returns to the same draft with a one-time publish resume, without inserting", async () => {
    savePendingTaskDraft({ category: "cleaning", title: "TEST cleaning", budget: 200, serviceDetails: { area_m2: 50 } });
    const from = vi.fn(() => { throw new Error("No database access expected for pending draft"); });
    const client = { from } as unknown as SupabaseClient;
    expect(await resolvePostAuthRedirect(client, "test-user")).toEqual({ path: "/create-task?continueDraft=1&publish=1&category=cleaning" });
    expect(from).not.toHaveBeenCalled();
    expect(readTaskDraft("test-user")?.serviceDetails).toEqual({ area_m2: 50 });
  });

  it("unconfirmed draft reopens the filled form for review, not home or dashboard", async () => {
    writeTaskDraft({ category: "moving", title: "TEST moving", budget: 300 });
    rememberPostAuthReturnTo("/create-task?continueDraft=1");
    const from = vi.fn(() => { throw new Error("No database access expected"); });
    const client = { from } as unknown as SupabaseClient;
    expect(await resolvePostAuthRedirect(client, "test-user")).toEqual({ path: "/create-task?continueDraft=1&category=moving" });
    expect(from).not.toHaveBeenCalled();
  });

  it("clearing a published draft removes both contents and pending flag", () => {
    savePendingTaskDraft({ category: "moving", title: "TEST moving", budget: 200 });
    clearPendingTaskDraft();
    expect(readTaskDraft("test-user")).toBeNull();
    expect(localStorage.getItem("task_draft_pending_submit")).toBeNull();
  });
});