/**
 * Single source of truth: service key (used in URLs, drafts, UI) → exact category_id.
 * Never resolve categories by fuzzy-matching translated names.
 */
export const SERVICE_REGISTRY = {
  cleaning: "393798f1-d8c8-490d-ba3d-934ca5e3730c",
  moving: "513b748c-2dbf-47ab-b155-5555e0d33765",
  repair: "1b9ebccf-e1b7-42d7-9d9c-0e583bedec18",
  digital: "6abb5fbb-71a0-44be-8423-66cceb1beb66",
  consulting: "1800d0c2-870b-42d0-9a5f-7a0728a7864a",
  delivery: "3a931638-4475-4a13-a359-7f9345e96f8d",
  beauty: "77289500-02e2-43af-b78a-eee24ba7cd94",
  tutoring: "cacd81b4-ba59-4b12-a9a6-bc4c8299c2d4",
} as const;

export type ServiceKey = keyof typeof SERVICE_REGISTRY;
export const SERVICE_KEYS = Object.keys(SERVICE_REGISTRY) as ServiceKey[];

export const isServiceKey = (v: unknown): v is ServiceKey =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(SERVICE_REGISTRY, v);

/** Accepts a service key or an exact category UUID; anything else → null. */
export const resolveServiceKey = (v: string | null | undefined): ServiceKey | null => {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (isServiceKey(s)) return s;
  const byId = SERVICE_KEYS.find((k) => SERVICE_REGISTRY[k] === s);
  return byId ?? null;
};

export const categoryIdFor = (key: string | null | undefined): string | null =>
  isServiceKey(key) ? SERVICE_REGISTRY[key] : null;

export const createTaskHref = (key: ServiceKey) => `/create-task?category=${key}`;

/**
 * Switching service keeps shared fields (title, description, location, urgency, photos)
 * and drops the price estimate / budget, which are service-specific.
 */
export function applyServiceChange<T extends { category?: string; budget?: number; budgetMax?: number }>(
  form: T,
  next: ServiceKey,
  defaults: { budget: number; budgetMax: number },
): T {
  if (form.category === next) return form;
  return { ...form, category: next, budget: defaults.budget, budgetMax: defaults.budgetMax };
}
