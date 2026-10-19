import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fromDateKey, toDateKey, zonedNow, type Schedule, type ScheduleError, type TimeMode } from "@/lib/schedule";

type Loc = "en" | "ru" | "he" | "ar";
const T = {
  title: { en: "When should it be done?", ru: "Когда выполнить?", he: "מתי לבצע?", ar: "متى يتم التنفيذ؟" },
  pick: { en: "Choose a date", ru: "Выбрать дату", he: "בחירת תאריך", ar: "اختيار تاريخ" },
  flexible: { en: "Date by agreement", ru: "Дата по договорённости", he: "תאריך בתיאום", ar: "التاريخ بالاتفاق" },
  date: { en: "Execution date", ru: "Дата выполнения", he: "תאריך ביצוע", ar: "تاريخ التنفيذ" },
  choose: { en: "Select a date", ru: "Выберите дату", he: "בחרו תאריך", ar: "اختر تاريخًا" },
  exact: { en: "Exact time", ru: "Точное время", he: "שעה מדויקת", ar: "وقت محدد" },
  interval: { en: "Time window", ru: "Интервал времени", he: "טווח שעות", ar: "فترة زمنية" },
  timeFlex: { en: "Time by agreement", ru: "Время по договорённости", he: "שעה בתיאום", ar: "الوقت بالاتفاق" },
  time: { en: "Time", ru: "Время", he: "שעה", ar: "الوقت" },
  from: { en: "From", ru: "С", he: "מ-", ar: "من" },
  to: { en: "To", ru: "До", he: "עד", ar: "إلى" },
  tz: { en: "Israel time", ru: "Время Израиля", he: "שעון ישראל", ar: "توقيت إسرائيل" },
} as const;

export const SCHEDULE_ERROR_TEXT: Record<ScheduleError, Record<Loc, string>> = {
  date_required: { en: "Choose a date", ru: "Выберите дату", he: "בחרו תאריך", ar: "اختر تاريخًا" },
  date_in_past: { en: "The date has already passed", ru: "Эта дата уже прошла", he: "התאריך כבר עבר", ar: "هذا التاريخ قد مضى" },
  time_required: { en: "Enter the time", ru: "Укажите время", he: "ציינו שעה", ar: "حدد الوقت" },
  time_in_past: { en: "This time has already passed today", ru: "Это время сегодня уже прошло", he: "השעה הזו כבר עברה היום", ar: "هذا الوقت قد مضى اليوم" },
  interval_required: { en: "Enter start and end time", ru: "Укажите время «С» и «До»", he: "ציינו שעת התחלה וסיום", ar: "حدد وقت البداية والنهاية" },
  interval_order: { en: "End must be later than start", ru: "«До» должно быть позже «С»", he: "שעת הסיום חייבת להיות אחרי ההתחלה", ar: "يجب أن تكون النهاية بعد البداية" },
};

type Props = { value: Schedule; onChange: (s: Schedule) => void; locale: Loc; error?: ScheduleError | null };

export function WhenBlock({ value, onChange, locale, error }: Props) {
  const [open, setOpen] = useState(false);
  const today = zonedNow();
  const set = (p: Partial<Schedule>) => onChange({ ...value, ...p });
  const intlLoc = { en: "en-GB", ru: "ru-RU", he: "he-IL", ar: "ar" }[locale];
  const minTime = value.date === today.date ? today.time : undefined;

  const seg = (active: boolean) =>
    cn("min-h-11 px-3 rounded-xl border text-sm font-medium transition-all",
      active ? "border-primary bg-emerald-50 text-primary" : "border-border text-muted-foreground hover:border-primary/30");

  return (
    <div className="space-y-3" data-testid="when-block">
      <label className="block text-sm font-medium">{T.title[locale]}</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={seg(value.mode === "date")} onClick={() => set({ mode: "date" })}>{T.pick[locale]}</button>
        <button type="button" className={seg(value.mode === "flexible")}
          onClick={() => onChange({ mode: "flexible", date: null, timeMode: "flexible", time: "", timeEnd: "" })}>{T.flexible[locale]}</button>
      </div>

      {value.mode === "date" && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">{T.date[locale]}</label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button type="button" data-testid="due-date-trigger"
                  className={cn("w-full h-11 flex items-center gap-2 px-3 rounded-xl border bg-background text-sm text-start",
                    error === "date_required" || error === "date_in_past" ? "border-destructive" : "border-border",
                    !value.date && "text-muted-foreground")}>
                  <CalendarIcon className="w-4 h-4 shrink-0" />
                  {value.date
                    ? fromDateKey(value.date).toLocaleDateString(intlLoc, { weekday: "short", day: "numeric", month: "long", year: "numeric" })
                    : T.choose[locale]}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] p-0" align="start">
                <Calendar
                  mode="single"
                  selected={value.date ? fromDateKey(value.date) : undefined}
                  onSelect={(d) => { if (d) { set({ date: toDateKey(d) }); setOpen(false); } }}
                  disabled={(d) => toDateKey(d) < today.date}
                  defaultMonth={value.date ? fromDateKey(value.date) : fromDateKey(today.date)}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(["exact", "interval", "flexible"] as TimeMode[]).map((m) => (
              <button key={m} type="button" className={seg(value.timeMode === m)} onClick={() => set({ timeMode: m })}>
                {m === "exact" ? T.exact[locale] : m === "interval" ? T.interval[locale] : T.timeFlex[locale]}
              </button>
            ))}
          </div>

          {value.timeMode === "exact" && (
            <div>
              <label htmlFor="due-time" className="block text-sm font-medium mb-1.5">{T.time[locale]} <span className="text-xs text-muted-foreground">({T.tz[locale]})</span></label>
              <Input id="due-time" type="time" className="h-11" min={minTime} value={value.time} onChange={(e) => set({ time: e.target.value })} />
            </div>
          )}
          {value.timeMode === "interval" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="due-from" className="block text-sm font-medium mb-1.5">{T.from[locale]}</label>
                <Input id="due-from" type="time" className="h-11" min={minTime} value={value.time} onChange={(e) => set({ time: e.target.value })} />
              </div>
              <div>
                <label htmlFor="due-to" className="block text-sm font-medium mb-1.5">{T.to[locale]}</label>
                <Input id="due-to" type="time" className="h-11" min={value.time || minTime} value={value.timeEnd} onChange={(e) => set({ timeEnd: e.target.value })} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">{T.tz[locale]}</p>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{SCHEDULE_ERROR_TEXT[error][locale]}</p>}
    </div>
  );
}
