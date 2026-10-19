import { describe, it, expect, beforeEach } from "vitest";
import {
  readTaskDraft, writeTaskDraft, TASK_DRAFT_KEY, TASK_DRAFT_TTL_MS, hasPendingTaskDraft, savePendingTaskDraft,
} from "./pendingTaskDraft";

describe("task draft rules", () => {
  beforeEach(() => localStorage.clear());

  it("drops drafts older than 24h", () => {
    writeTaskDraft({ title: "old" }, null);
    expect(readTaskDraft(null, Date.now() + TASK_DRAFT_TTL_MS + 1000)).toBeNull();
    expect(localStorage.getItem(TASK_DRAFT_KEY)).toBeNull();
  });

  it("drops legacy drafts without schema version", () => {
    localStorage.setItem(TASK_DRAFT_KEY, JSON.stringify({ title: "legacy" }));
    expect(readTaskDraft(null)).toBeNull();
  });

  it("never gives one user's draft to another user", () => {
    writeTaskDraft({ title: "mine" }, "user-a");
    expect(readTaskDraft("user-b")).toBeNull();
    expect(readTaskDraft("user-a")?.title).toBe("mine");
  });

  it("lets the signing-in user adopt a guest draft", () => {
    savePendingTaskDraft({ title: "guest" });
    expect(hasPendingTaskDraft()).toBe(true);
    expect(readTaskDraft("user-a")?.title).toBe("guest");
  });
});
