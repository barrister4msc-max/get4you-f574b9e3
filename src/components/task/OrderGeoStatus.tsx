import { Loader2, RotateCw } from "lucide-react";
import { cityLabel, typedCityMismatch, type Lang, type OrderGeo } from "@/lib/orderGeo";

export const GEO_TXT: Record<string, Record<Lang, string>> = {
  city: { en: "City", ru: "Город", he: "עיר", ar: "المدينة" },
  hood: { en: "Neighborhood", ru: "Район", he: "שכונה", ar: "الحي" },
  unknown: { en: "unknown", ru: "не определён", he: "לא ידוע", ar: "غير معروف" },
  resolving: { en: "Detecting city…", ru: "Определяем город…", he: "מזהה עיר…", ar: "جارٍ تحديد المدينة…" },
  noCity: { en: "Could not determine the city for this address. Please refine the address.", ru: "Не удалось определить город по адресу. Уточните адрес.", he: "לא ניתן לזהות את העיר. נא לדייק את הכתובת.", ar: "تعذر تحديد المدينة. يرجى توضيح العنوان." },
  error: { en: "Map service (OpenStreetMap) is unavailable right now.", ru: "Картографический сервис (OpenStreetMap) сейчас недоступен.", he: "שירות המפות (OpenStreetMap) אינו זמין כעת.", ar: "خدمة الخرائط (OpenStreetMap) غير متاحة حاليًا." },
  retry: { en: "Retry", ru: "Повторить", he: "נסה שוב", ar: "إعادة المحاولة" },
  deviceDiffers: { en: "Your device is at a different place", ru: "Устройство находится в другом месте", he: "המכשיר נמצא במקום אחר", ar: "جهازك في مكان آخر" },
  useDevice: { en: "Use this address", ru: "Использовать этот адрес", he: "השתמש בכתובת זו", ar: "استخدم هذا العنوان" },
  mismatch: { en: "The address was found in a different city — please check it.", ru: "Адрес найден в другом городе — проверьте его.", he: "הכתובת נמצאה בעיר אחרת — נא לבדוק.", ar: "تم العثور على العنوان في مدينة أخرى — يرجى التحقق." },
  keep: { en: "Keep order address", ru: "Оставить адрес заказа", he: "השאר את כתובת ההזמנה", ar: "إبقاء عنوان الطلب" },
};

type Props = { status: "idle" | "resolving" | "resolved" | "no_city" | "error"; geo: OrderGeo | null; locale: Lang; onRetry: () => void };

export function OrderGeoStatus({ status, geo, locale, onRetry }: Props) {
  if (status === "resolving") return <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />{GEO_TXT.resolving[locale]}</p>;
  if (status === "error") return (
    <p className="mt-1.5 text-xs text-destructive flex items-center gap-2">{GEO_TXT.error[locale]}
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 underline text-primary"><RotateCw className="w-3 h-3" />{GEO_TXT.retry[locale]}</button>
    </p>
  );
  if (status === "no_city") return <p className="mt-1.5 text-xs text-amber-600">{GEO_TXT.noCity[locale]}</p>;
  if (!geo) return null;
  const mismatch = typedCityMismatch(geo, geo.resolvedFor);
  return (<>
    {mismatch && <p className="mt-1.5 text-xs text-amber-600" data-testid="city-mismatch">{GEO_TXT.mismatch[locale]}</p>}
    <p className="mt-1.5 text-xs text-muted-foreground" data-testid="order-geo">
      {GEO_TXT.city[locale]}: <span className="font-medium text-foreground">{cityLabel(geo, locale)}</span>
      {" · "}{GEO_TXT.hood[locale]}: <span className="font-medium text-foreground">{geo.neighborhoodName ?? GEO_TXT.unknown[locale]}</span>
      {" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap</a>
    </p>
  </>);
}
