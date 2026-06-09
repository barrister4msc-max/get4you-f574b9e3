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

export const loadPendingTaskDraft = (): PendingTaskDraft | null => {
  try {
    const raw = localStorage.getItem(TASK_DRAFT_KEY);
    if (!raw) return null;
    return normalizeDraft(JSON.parse(raw) as PendingTaskDraft);
  } catch {
    return null;
  }
};

export const hasPendingTaskDraft = (): boolean => {
  try {
    return localStorage.getItem(TASK_DRAFT_PENDING_KEY) === "1";
  } catch {
    return false;
  }
};

export const savePendingTaskDraft = (draft: unknown) => {
  localStorage.setItem(TASK_DRAFT_KEY, JSON.stringify(draft));
  localStorage.setItem(TASK_DRAFT_PENDING_KEY, "1");
};

export const clearPendingTaskDraft = () => {
  localStorage.removeItem(TASK_DRAFT_KEY);
  localStorage.removeItem(TASK_DRAFT_PENDING_KEY);
};

const resolveCategoryId = async (category: string | undefined) => {
  const normalized = category?.trim();
  if (!normalized) return null;

  const titleCase = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const { data: exactMatch } = await supabase
    .from("categories")
    .select("id")
    .eq("name_en", titleCase)
    .maybeSingle();

  if (exactMatch?.id) return exactMatch.id;

  const { data: fuzzyMatch } = await supabase
    .from("categories")
    .select("id")
    .ilike("name_en", `%${normalized}%`)
    .maybeSingle();

  return fuzzyMatch?.id ?? null;
};

export const createTaskFromPendingDraft = async ({
  userId,
  currency,
}: {
  userId: string;
  currency: string;
}) => {
  const draft = loadPendingTaskDraft();

  if (!draft?.title || !draft.budget || draft.budget <= 0) {
    throw new Error("Pending task draft is incomplete");
  }

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

  if (error) throw error;

  clearPendingTaskDraft();
  return data?.id ?? null;
};