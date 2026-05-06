/**
 * Single source of truth for role naming.
 *
 * The DB / API canonical worker role is `executor`. The UI legacy alias
 * is `tasker`. Always store / send `executor`; only show `tasker` in
 * presentation code that has not yet migrated.
 */

export type DbOrdinaryRole = "client" | "executor";
export type UiActiveRole = "client" | "tasker";

export const toDbRole = (r: UiActiveRole | DbOrdinaryRole | string): DbOrdinaryRole => {
  return r === "tasker" || r === "executor" ? "executor" : "client";
};

export const toUiRole = (r: UiActiveRole | DbOrdinaryRole | string): UiActiveRole => {
  return r === "tasker" || r === "executor" ? "tasker" : "client";
};

export const isOrdinaryRole = (r: string): r is DbOrdinaryRole =>
  r === "client" || r === "executor";

/** Treat both `executor` (canonical) and `tasker` (legacy) as worker. */
export const hasWorkerRole = (roles: string[]): boolean =>
  roles.includes("executor") || roles.includes("tasker");

export const hasClientRole = (roles: string[]): boolean => roles.includes("client");