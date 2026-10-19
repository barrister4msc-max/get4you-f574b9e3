import { describe, expect, it } from "vitest";
import { buildServiceTitle } from "./serviceFields";
import { MOVING_CATEGORY_ID, safeTranslationInputs } from "../../supabase/functions/_shared/taskTranslationPrivacy";

describe("moving address privacy", () => {
  it("never copies moving addresses into generated titles", () => {
    for (const locale of ["en", "ru", "he", "ar"] as const) {
      const title = buildServiceTitle("moving", { from_address: "PRIVATE_FROM", to_address: "PRIVATE_TO" }, locale);
      expect(title).not.toContain("PRIVATE_");
      expect(title.length).toBeGreaterThan(0);
    }
  });
  it("uses a safe moving translation source instead of stored address-bearing copy", () => {
    expect(safeTranslationInputs([{ id: "test" }], [{ id: "test", category_id: MOVING_CATEGORY_ID, title: "PRIVATE_FROM", description: "PRIVATE_ACCESS" }]))
      .toEqual([{ id: "test", title: "Moving", description: null, privateMoving: true }]);
  });
  it("does not return or translate inaccessible tasks", () => {
    expect(safeTranslationInputs([{ id: "inaccessible" }], [])).toEqual([]);
  });
});