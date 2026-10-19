import type { ServiceKey } from "./serviceRegistry";

/**
 * Service parameter configuration. Initial set — edit freely after discussion.
 * No surcharges are derived from these fields; they only describe the job.
 */
export type Locale = "en" | "ru" | "he" | "ar";
export type L = Record<Locale, string>;
export type ServiceDetails = Record<string, string | number | boolean | null | undefined>;

export type FieldDef =
  | { key: string; type: "number"; label: L; min?: number; max?: number; unit?: L; required?: boolean; showIf?: (d: ServiceDetails) => boolean }
  | { key: string; type: "text" | "textarea"; label: L; placeholder?: L; required?: boolean; showIf?: (d: ServiceDetails) => boolean }
  | { key: string; type: "boolean"; label: L; showIf?: (d: ServiceDetails) => boolean }
  | { key: string; type: "select"; label: L; options: { value: string; label: L }[]; required?: boolean; showIf?: (d: ServiceDetails) => boolean };

export type FieldGroup = { title?: L; fields: FieldDef[] };

const yesNoFloor = (prefix: string, title: L): FieldGroup => ({
  title,
  fields: [
    { key: `${prefix}_floor`, type: "number", min: -5, max: 100, label: { en: "Floor", ru: "Этаж", he: "קומה", ar: "الطابق" } },
    { key: `${prefix}_elevator`, type: "boolean", label: { en: "Elevator available", ru: "Есть лифт", he: "יש מעלית", ar: "يوجد مصعد" } },
  ],
});

export const SERVICE_FIELDS: Partial<Record<ServiceKey, FieldGroup[]>> = {
  cleaning: [
    {
      fields: [
        { key: "area_m2", type: "number", min: 1, max: 5000, required: true,
          label: { en: "Area", ru: "Площадь", he: "שטח", ar: "المساحة" }, unit: { en: "m²", ru: "м²", he: "מ״ר", ar: "م²" } },
        { key: "cleaning_type", type: "select", required: true,
          label: { en: "Type of cleaning", ru: "Вид уборки", he: "סוג ניקיון", ar: "نوع التنظيف" },
          options: [
            { value: "regular", label: { en: "Regular", ru: "Обычная", he: "רגיל", ar: "عادي" } },
            { value: "deep", label: { en: "Deep / general", ru: "Генеральная", he: "יסודי", ar: "شامل" } },
            { value: "after_renovation", label: { en: "After renovation", ru: "После ремонта", he: "אחרי שיפוץ", ar: "بعد الترميم" } },
            { value: "move_in_out", label: { en: "Move-in / move-out", ru: "При переезде", he: "כניסה / יציאה", ar: "عند الانتقال" } },
          ] },
        { key: "windows", type: "boolean", label: { en: "Window washing needed", ru: "Нужна мойка окон", he: "צריך ניקוי חלונות", ar: "مطلوب تنظيف النوافذ" } },
        { key: "windows_count", type: "number", min: 1, max: 200, required: true, showIf: (d) => d.windows === true,
          label: { en: "Number of windows", ru: "Количество окон", he: "מספר חלונות", ar: "عدد النوافذ" } },
        { key: "wishes", type: "textarea",
          label: { en: "Additional wishes", ru: "Дополнительные пожелания", he: "בקשות נוספות", ar: "طلبات إضافية" } },
      ],
    },
  ],
  moving: [
    {
      fields: [
        { key: "from_address", type: "text", required: true, label: { en: "From address", ru: "Адрес отправления", he: "כתובת מוצא", ar: "عنوان الانطلاق" } },
        { key: "to_address", type: "text", required: true, label: { en: "Destination address", ru: "Адрес назначения", he: "כתובת יעד", ar: "عنوان الوجهة" } },
        { key: "items", type: "textarea", required: true, label: { en: "List of items", ru: "Перечень вещей", he: "רשימת פריטים", ar: "قائمة الأغراض" } },
      ],
    },
    yesNoFloor("from", { en: "Departure", ru: "Отправление", he: "מוצא", ar: "الانطلاق" }),
    yesNoFloor("to", { en: "Destination", ru: "Назначение", he: "יעד", ar: "الوجهة" }),
    { fields: [{ key: "movers", type: "boolean", label: { en: "Movers (loaders) needed", ru: "Нужны грузчики", he: "צריך סבלים", ar: "مطلوب عمال تحميل" } }] },
  ],
};

export const getServiceFields = (key: string | null | undefined): FieldGroup[] =>
  (key && SERVICE_FIELDS[key as ServiceKey]) || [];

const visible = (f: FieldDef, d: ServiceDetails) => !f.showIf || f.showIf(d);

/** Drop values of hidden fields and fields unknown to this service. */
export function sanitizeServiceDetails(key: string | null | undefined, d: ServiceDetails): ServiceDetails {
  const out: ServiceDetails = {};
  for (const g of getServiceFields(key)) for (const f of g.fields) {
    if (!visible(f, d)) continue;
    const v = d[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.type === "number") { const n = Number(v); if (Number.isFinite(n)) out[f.key] = n; }
    else if (f.type === "boolean") out[f.key] = v === true;
    else out[f.key] = String(v).trim().slice(0, 2000);
  }
  return out;
}

/** Returns the first invalid field key, or null. */
export function validateServiceDetails(key: string | null | undefined, d: ServiceDetails): string | null {
  for (const g of getServiceFields(key)) for (const f of g.fields) {
    if (!visible(f, d)) continue;
    const v = d[f.key];
    const empty = v === undefined || v === null || v === "";
    if ("required" in f && f.required && empty) return f.key;
    if (f.type === "number" && !empty) {
      const n = Number(v);
      if (!Number.isFinite(n) || (f.min != null && n < f.min) || (f.max != null && n > f.max)) return f.key;
    }
  }
  return null;
}

const SERVICE_NAME: Record<string, L> = {
  cleaning: { en: "Cleaning", ru: "Уборка", he: "ניקיון", ar: "تنظيف" },
  moving: { en: "Moving", ru: "Переезд", he: "הובלה", ar: "نقل" },
};

/** Builds a task title from the service and its parameters (e.g. "Уборка · 80 м² · Генеральная"). */
export function buildServiceTitle(key: string | null | undefined, d: ServiceDetails, locale: Locale, fallbackName?: string): string {
  const name = (key && SERVICE_NAME[key]?.[locale]) || fallbackName || "";
  const parts: string[] = [name];
  if (key === "cleaning") {
    if (d.area_m2) parts.push(`${d.area_m2} ${locale === "ru" ? "м²" : locale === "he" ? "מ״ר" : locale === "ar" ? "م²" : "m²"}`);
    const opt = (SERVICE_FIELDS.cleaning![0].fields.find((f) => f.key === "cleaning_type") as Extract<FieldDef, { type: "select" }>)
      .options.find((o) => o.value === d.cleaning_type);
    if (opt) parts.push(opt.label[locale]);
  }
  return parts.filter(Boolean).join(" · ").slice(0, 120);
}

/** Human-readable lines for review / task card. */
export function describeServiceDetails(key: string | null | undefined, d: ServiceDetails | null | undefined, locale: Locale) {
  const rows: { label: string; value: string }[] = [];
  if (!d) return rows;
  const yes = { en: "Yes", ru: "Да", he: "כן", ar: "نعم" }[locale];
  const no = { en: "No", ru: "Нет", he: "לא", ar: "لا" }[locale];
  for (const g of getServiceFields(key)) for (const f of g.fields) {
    const v = d[f.key];
    if (v === undefined || v === null || v === "") continue;
    const prefix = g.title ? `${g.title[locale]}: ` : "";
    let value = String(v);
    if (f.type === "boolean") value = v ? yes : no;
    if (f.type === "select") value = f.options.find((o) => o.value === v)?.label[locale] ?? value;
    if (f.type === "number" && f.unit) value = `${v} ${f.unit[locale]}`;
    rows.push({ label: prefix + f.label[locale], value });
  }
  return rows;
}
