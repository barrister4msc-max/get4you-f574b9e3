/** Budget columns for a new task: a fixed price is min = max = fixed. */
export function budgetColumns(budgetType: string | undefined, budget: number, budgetMax?: number) {
  const max = budgetType === "range" ? Math.max(Number(budgetMax) || 0, budget) : budget;
  return { budget_fixed: budget, budget_min: budget, budget_max: max };
}
