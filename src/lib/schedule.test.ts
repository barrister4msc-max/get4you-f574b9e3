import { describe, it, expect } from "vitest";
import { validateSchedule, zonedNow, scheduleToRow, toDateKey } from "./schedule";
import { validateServiceDetails, sanitizeServiceDetails } from "./serviceFields";

// 2026-10-19 21:30 UTC = 2026-10-20 00:30 in Jerusalem (UTC+3)
const NOW = new Date("2026-10-19T21:30:00Z");

describe("execution date rules", () => {
  it("uses Jerusalem date regardless of device timezone", () => {
    expect(zonedNow("Asia/Jerusalem", NOW).date).toBe("2026-10-20");
  });
  it("rejects past dates", () => {
    expect(validateSchedule({ mode: "date", date: "2026-10-19", timeMode: "flexible", time: "", timeEnd: "" }, "Asia/Jerusalem", NOW)).toBe("date_in_past");
  });
  it("rejects past time today", () => {
    expect(validateSchedule({ mode: "date", date: "2026-10-20", timeMode: "exact", time: "00:15", timeEnd: "" }, "Asia/Jerusalem", NOW)).toBe("time_in_past");
  });
  it("interval end must be after start", () => {
    expect(validateSchedule({ mode: "date", date: "2026-10-21", timeMode: "interval", time: "14:00", timeEnd: "13:00" }, "Asia/Jerusalem", NOW)).toBe("interval_order");
  });
  it("flexible date stores no invented date", () => {
    expect(scheduleToRow({ mode: "flexible", date: "2026-10-21", timeMode: "exact", time: "10:00", timeEnd: "" }))
      .toMatchObject({ schedule_mode: "flexible", due_date: null, due_time: null });
  });
  it("calendar date key does not shift to previous day", () => {
    expect(toDateKey(new Date(2026, 9, 21, 0, 5))).toBe("2026-10-21");
  });
});

describe("service parameters", () => {
  it("window count required only when window washing chosen", () => {
    expect(validateServiceDetails("cleaning", { area_m2: 80, cleaning_type: "deep", windows: false })).toBeNull();
    expect(validateServiceDetails("cleaning", { area_m2: 80, cleaning_type: "deep", windows: true })).toBe("windows_count");
  });
  it("hidden window count is not saved", () => {
    expect(sanitizeServiceDetails("cleaning", { area_m2: 80, windows: false, windows_count: 5 })).toEqual({ area_m2: 80, windows: false });
  });
});
