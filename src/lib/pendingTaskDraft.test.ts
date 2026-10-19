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

import { resolveServiceKey, categoryIdFor, applyServiceChange } from "./serviceRegistry";
describe("service selection rules", () => {
  it("maps cleaning and moving to exact categories", () => {
    expect(categoryIdFor("cleaning")).toBe("393798f1-d8c8-490d-ba3d-934ca5e3730c");
    expect(categoryIdFor("moving")).toBe("513b748c-2dbf-47ab-b155-5555e0d33765");
  });
  it("rejects unknown or fuzzy service names", () => {
    expect(resolveServiceKey("clean")).toBeNull();
    expect(categoryIdFor("Уборка")).toBeNull();
  });
  it("chosen cleaning overrides an old moving draft but keeps shared fields", () => {
    const next = applyServiceChange({ category: "moving", title: "Квартира", budget: 900, budgetMax: 1500 }, "cleaning", { budget: 100, budgetMax: 200 });
    expect(next).toMatchObject({ category: "cleaning", title: "Квартира", budget: 100, budgetMax: 200 });
  });
});
