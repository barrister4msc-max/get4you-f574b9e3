import { describe, expect, it } from "vitest";
import { budgetColumns } from "./taskBudget";

describe("task budget columns", () => {
  it("fixed price ignores a stale hidden budgetMax", () => {
    expect(budgetColumns("fixed", 350, 200)).toEqual({ budget_fixed: 350, budget_min: 350, budget_max: 350 });
  });
  it("range never has max below min", () => {
    expect(budgetColumns("range", 300, 200).budget_max).toBe(300);
  });
});
