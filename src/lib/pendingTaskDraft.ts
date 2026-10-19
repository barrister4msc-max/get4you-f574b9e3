import { categoryIdFor } from "./serviceRegistry";
import { supabase } from "@/integrations/supabase/client";

export const TASK_DRAFT_KEY = "task_draft";
export const TASK_DRAFT_PENDING_KEY = "task_draft_pending_submit";

type PendingTaskDraft = {
  category?: string;
  taskType?: "onsite" | "remote";
  title?: string;
  description?: string;
  budget?: number;
  budgetMax?: number;
  urgency?: string;
  location?: string;
};

const normalizeDraft = (draft: PendingTaskDraft | null): PendingTaskDraft | null => {
  if (!draft) return null;

  return {
    category: draft.category ?? "",
    taskType: draft.taskType === "remote" ? "remote" : "onsite",
    title: draft.title?.trim() ?? "",
    description: draft.description?.trim() ?? "",
    budget: Number(draft.budget ?? 0),
    budgetMax: Number(draft.budgetMax ?? draft.budget ?? 0),
    urgency: draft.urgency ?? "flexible",
    location: draft.location?.trim() ?? "",
  };
};

export const TASK_DRAFT_SCHEMA_VERSION = 2;
export const TASK_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type DraftEnvelope = {
  v: number;
  savedAt: number;
  ownerId: string | null; // null = guest session
  data: PendingTaskDraft & Record<string, unknown>;
};

const GUEST = null;

/** Read draft envelope; drops expired, legacy or foreign-owner drafts. */
export const readTaskDraft = (
  ownerId: string | null = GUEST,
  now: number = Date.now(),
): (PendingTaskDraft & Record<string, unknown>) | null => {
  try {
    const raw = localStorage.getItem(TASK_DRAFT_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as Partial<DraftEnvelope>;
    const valid =
      env && env.v === TASK_DRAFT_SCHEMA_VERSION &&
      typeof env.savedAt === "number" && now - env.savedAt <= TASK_DRAFT_TTL_MS &&
      env.data && typeof env.data === "object";
    if (!valid) { clearPendingTaskDraft(); return null; }
    // A guest draft may be adopted by the user who signs in; another user's draft may not.
    if (env.ownerId && env.ownerId !== ownerId) return null;
    return env.data as PendingTaskDraft & Record<string, unknown>;
  } catch {
    clearPendingTaskDraft();
    return null;
  }
};

export const writeTaskDraft = (draft: unknown, ownerId: string | null = GUEST) => {
  const env: DraftEnvelope = {
    v: TASK_DRAFT_SCHEMA_VERSION,
    savedAt: Date.now(),
    ownerId,
    data: draft as DraftEnvelope["data"],
  };
  localStorage.setItem(TASK_DRAFT_KEY, JSON.stringify(env));
};

export const loadPendingTaskDraft = (ownerId: string | null = GUEST): PendingTaskDraft | null =>
  normalizeDraft(readTaskDraft(ownerId));

export const hasPendingTaskDraft = (): boolean => {
  try {
    if (localStorage.getItem(TASK_DRAFT_PENDING_KEY) !== "1") return false;
    if (!readTaskDraft(GUEST) && !localStorage.getItem(TASK_DRAFT_KEY)) {
      localStorage.removeItem(TASK_DRAFT_PENDING_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const savePendingTaskDraft = (draft: unknown, ownerId: string | null = GUEST) => {
  writeTaskDraft(draft, ownerId);
  localStorage.setItem(TASK_DRAFT_PENDING_KEY, "1");
};

export const clearPendingTaskDraft = () => {
  localStorage.removeItem(TASK_DRAFT_KEY);
  localStorage.removeItem(TASK_DRAFT_PENDING_KEY);
};

const resolveCategoryId = async (category: string | undefined) => categoryIdFor(category);

let inFlight: Promise<string | null> | null = null;

/** Single-flight: concurrent auth callbacks can never publish the same draft twice. */
export const createTaskFromPendingDraft = (args: { userId: string; currency: string }) => {
  if (!inFlight) inFlight = doCreateTaskFromPendingDraft(args).finally(() => { inFlight = null; });
  return inFlight;
};

const doCreateTaskFromPendingDraft = async ({
  userId,
  currency,
}: {
  userId: string;
  currency: string;
}) => {
  const draft = loadPendingTaskDraft(userId);

  if (!draft?.title || !draft.budget || draft.budget <= 0) {
    clearPendingTaskDraft();
    throw new Error("Pending task draft is incomplete");
  }

  // Claim the draft before inserting so a reload/other tab cannot re-publish it.
  const rawEnvelope = localStorage.getItem(TASK_DRAFT_KEY);
  clearPendingTaskDraft();

  const categoryId = await resolveCategoryId(draft.category);
  const budget = Number(draft.budget);
  const budgetMax = Number(draft.budgetMax) > 0 ? Number(draft.budgetMax) : budget;

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title: draft.title,
      description: draft.description || null,
      category_id: categoryId,
      task_type: draft.taskType === "remote" ? "remote" : "onsite",
      budget_fixed: budget,
      budget_min: budget,
      budget_max: budgetMax,
      is_urgent: draft.urgency === "urgent",
      address: draft.taskType === "remote" ? null : draft.location || null,
      latitude: null,
      longitude: null,
      status: "open",
      currency,
    })
    .select("id")
    .single();

  if (error) {
    if (rawEnvelope) {
      localStorage.setItem(TASK_DRAFT_KEY, rawEnvelope);
      localStorage.setItem(TASK_DRAFT_PENDING_KEY, "1");
    }
    throw error;
  }

  return data?.id ?? null;
};