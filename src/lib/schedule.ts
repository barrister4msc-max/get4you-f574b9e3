/**
 * Execution date/time for an order. Dates are local calendar dates ("YYYY-MM-DD")
 * in the order's timezone (Israel → Asia/Jerusalem), never converted through UTC.
 */
export const ORDER_TIMEZONE = "Asia/Jerusalem";

export type TimeMode = "exact" | "interval" | "flexible";
export type Schedule = {
  mode: "date" | "flexible";
  date: string | null; // YYYY-MM-DD
  timeMode: TimeMode;
  time: string; // HH:mm
  timeEnd: string; // HH:mm
};

export const EMPTY_SCHEDULE: Schedule = { mode: "flexible", date: null, timeMode: "flexible", time: "", timeEnd: "" };

/** Current date and time in the given zone, independent of the device timezone. */
export function zonedNow(tz = ORDER_TIMEZONE, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Local calendar date → "YYYY-MM-DD" without UTC shift. */
export const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "YYYY-MM-DD" → local Date at noon (safe for calendar display). */
export const fromDateKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

export type ScheduleError =
  | "date_required" | "date_in_past" | "time_required" | "time_in_past"
  | "interval_required" | "interval_order";

export function validateSchedule(s: Schedule, tz = ORDER_TIMEZONE, now = new Date()): ScheduleError | null {
  if (s.mode === "flexible") return null;
  if (!s.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return "date_required";
  const today = zonedNow(tz, now);
  if (s.date < today.date) return "date_in_past";
  if (s.timeMode === "exact") {
    if (!s.time) return "time_required";
    if (s.date === today.date && s.time <= today.time) return "time_in_past";
  }
  if (s.timeMode === "interval") {
    if (!s.time || !s.timeEnd) return "interval_required";
    if (s.timeEnd <= s.time) return "interval_order";
    if (s.date === today.date && s.time <= today.time) return "time_in_past";
  }
  return null;
}

/** Columns for the tasks table. */
export function scheduleToRow(s: Schedule) {
  if (s.mode === "flexible") {
    return { schedule_mode: "flexible", due_date: null, time_mode: null, due_time: null, due_time_end: null, schedule_timezone: ORDER_TIMEZONE };
  }
  return {
    schedule_mode: "date",
    due_date: s.date,
    time_mode: s.timeMode,
    due_time: s.timeMode === "flexible" ? null : s.time,
    due_time_end: s.timeMode === "interval" ? s.timeEnd : null,
    schedule_timezone: ORDER_TIMEZONE,
  };
}

const LBL = {
  flexible: { en: "By agreement", ru: "По договорённости", he: "בתיאום", ar: "بالاتفاق" },
  timeFlexible: { en: "time by agreement", ru: "время по договорённости", he: "שעה בתיאום", ar: "الوقت بالاتفاق" },
};
type Loc = "en" | "ru" | "he" | "ar";

/** Formats a schedule from task columns for display. */
export function formatSchedule(
  row: { schedule_mode?: string | null; due_date?: string | null; time_mode?: string | null; due_time?: string | null; due_time_end?: string | null },
  locale: Loc,
): string {
  if (row.schedule_mode !== "date" || !row.due_date) return LBL.flexible[locale];
  const intlLoc = { en: "en-GB", ru: "ru-RU", he: "he-IL", ar: "ar" }[locale];
  const date = fromDateKey(row.due_date).toLocaleDateString(intlLoc, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");
  if (row.time_mode === "exact" && row.due_time) return `${date}, ${hhmm(row.due_time)}`;
  if (row.time_mode === "interval" && row.due_time && row.due_time_end) return `${date}, ${hhmm(row.due_time)}–${hhmm(row.due_time_end)}`;
  return `${date}, ${LBL.timeFlexible[locale]}`;
}
