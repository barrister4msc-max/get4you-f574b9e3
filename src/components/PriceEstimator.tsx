import { useEffect, useRef, useState } from "react";
import { Lightbulb, Loader2, Sparkles, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { categoryIdFor, resolveServiceKey } from "@/lib/serviceRegistry";
import {
  estimateKey, parseEstimateResponse, type EstimateParams, type EstimateResult,
} from "../../supabase/functions/_shared/priceEstimate";

/** Shape consumed by PriceFeedback; only produced from an "available" estimate. */
export type EstimateSummary = { min_price: number; max_price: number; recommended_price: number; currency: string };

type L = "en" | "ru" | "he" | "ar";
const TXT: Record<string, Record<L, string>> = {
  title: { en: "Price estimate", ru: "Оценка стоимости", he: "הערכת מחיר", ar: "تقدير السعر" },
  tariff: { en: "Calculated by tariff", ru: "Расчёт по тарифу", he: "חישוב לפי תעריף", ar: "محسوب حسب التعرفة" },
  history: { en: "Estimate from {n} comparable completed orders", ru: "Оценка по {n} сопоставимым выполненным заказам", he: "הערכה לפי {n} הזמנות דומות שהושלמו", ar: "تقدير من {n} طلبات مكتملة مماثلة" },
  range: { en: "Middle half of final prices; recommended = median.", ru: "Средняя половина итоговых цен; рекомендуемая — медиана.", he: "מחצית אמצעית של המחירים הסופיים; מומלץ = חציון.", ar: "النصف الأوسط من الأسعار النهائية؛ الموصى به = الوسيط." },
  unavailable: { en: "Not enough data for an estimate. Please enter your budget.", ru: "Недостаточно данных для оценки. Укажите бюджет самостоятельно.", he: "אין מספיק נתונים להערכה. הזינו תקציב בעצמכם.", ar: "لا توجد بيانات كافية للتقدير. أدخل ميزانيتك." },
  error: { en: "Could not load the estimate.", ru: "Не удалось получить оценку.", he: "לא ניתן לטעון הערכה.", ar: "تعذر تحميل التقدير." },
  retry: { en: "Retry", ru: "Повторить", he: "נסה שוב", ar: "إعادة المحاولة" },
  use: { en: "Use this price", ru: "Использовать эту цену", he: "השתמש במחיר זה", ar: "استخدم هذا السعر" },
  loading: { en: "Calculating…", ru: "Считаем…", he: "מחשב…", ar: "جارٍ الحساب…" },
  rec: { en: "Recommended", ru: "Рекомендуемая", he: "מומלץ", ar: "الموصى به" },
};

interface Props {
  category: string;
  serviceDetails: Record<string, unknown>;
  cityId: string | null;
  neighborhoodId: string | null;
  /** Called only on explicit click; never auto-overwrites a manual budget. */
  onUseSuggested: (price: number) => void;
  onEstimate?: (e: EstimateSummary | null) => void;
}

export function buildEstimateParams(category: string, sd: Record<string, unknown>, cityId: string | null, neighborhoodId: string | null, currency: string): EstimateParams | null {
  const service = resolveServiceKey(category);
  if (!service) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    service, currency,
    subtype: typeof sd.cleaning_type === "string" ? sd.cleaning_type : null,
    areaM2: n(sd.area_m2),
    windows: sd.windows === true ? n(sd.windows_count) : null,
    cityId, neighborhoodId,
  };
}

export const PriceEstimator = ({ category, serviceDetails, cityId, neighborhoodId, onUseSuggested, onEstimate }: Props) => {
  const { locale, currency } = useLanguage();
  const loc = (["en", "ru", "he", "ar"].includes(locale) ? locale : "en") as L;
  const fp = useFormatPrice();
  const params = buildEstimateParams(category, serviceDetails || {}, cityId, neighborhoodId, currency);
  const key = params ? estimateKey(params) : null;
  const [state, setState] = useState<{ key: string; result: EstimateResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const seq = useRef(0);
  const onEstimateRef = useRef(onEstimate);
  onEstimateRef.current = onEstimate;

  useEffect(() => {
    const my = ++seq.current;
    onEstimateRef.current?.(null); // previous estimate is no longer current
    if (!params || !key) { setState(null); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const h = setTimeout(async () => {
      let result: EstimateResult;
      try {
        const { data, error } = await supabase.functions.invoke("estimate-task-price", {
          body: { service: params.service, category_id: categoryIdFor(params.service), subtype: params.subtype,
            area_m2: params.areaM2, windows: params.windows, city_id: params.cityId, neighborhood_id: params.neighborhoodId, currency: params.currency },
          signal: ctrl.signal,
        });
        result = error ? { status: "error", reason: "request_failed" } : parseEstimateResponse(data);
      } catch {
        result = { status: "error", reason: "request_failed" };
      }
      if (ctrl.signal.aborted || my !== seq.current) return; // stale response
      setState({ key, result });
      setLoading(false);
      if (result.status === "available") {
        onEstimateRef.current?.(result.method === "tariff"
          ? { min_price: result.total, max_price: result.total, recommended_price: result.total, currency: result.currency }
          : { min_price: result.min, max_price: result.max, recommended_price: result.recommended, currency: result.currency });
      }
    }, 600);
    return () => { clearTimeout(h); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  if (!params) return null;
  const current = state && state.key === key ? state.result : null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-emerald-50/50 p-4 sm:p-5 space-y-3" data-testid="price-estimator">
      <div className="flex items-center gap-2 text-primary">
        <Lightbulb className="w-5 h-5 shrink-0" />
        <h3 className="text-sm sm:text-base font-semibold">{TXT.title[loc]}</h3>
      </div>
      {(loading || !current) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />{TXT.loading[loc]}
        </div>
      )}
      {!loading && current?.status === "unavailable" && <p className="text-sm text-muted-foreground">{TXT.unavailable[loc]}</p>}
      {!loading && current?.status === "error" && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-destructive">{TXT.error[loc]}</span>
          <button type="button" onClick={() => setRetry((r) => r + 1)} className="inline-flex items-center gap-1 text-primary underline">
            <RotateCw className="w-3.5 h-3.5" />{TXT.retry[loc]}
          </button>
        </div>
      )}
      {!loading && current?.status === "available" && (() => {
        const cur = current.currency as "ILS" | "USD";
        const rec = current.method === "tariff" ? current.total : current.recommended;
        return (
          <>
            {current.method === "tariff" ? (
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{fp(current.total, cur, cur)}</div>
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-bold text-foreground">{fp(current.min, cur, cur)} – {fp(current.max, cur, cur)}</div>
                <div className="text-sm"><span className="font-medium">{TXT.rec[loc]}: </span><span className="font-bold text-primary">{fp(current.recommended, cur, cur)}</span></div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              {current.method === "tariff" ? TXT.tariff[loc] : `${TXT.history[loc].replace("{n}", String(current.provenance.sampleSize))}. ${TXT.range[loc]}`}
            </p>
            {cur === currency && (
              <button type="button" onClick={() => onUseSuggested(rec)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity text-sm">
                <Sparkles className="w-4 h-4" />{TXT.use[loc]}
              </button>
            )}
          </>
        );
      })()}
    </div>
  );
};

export const PriceFeedback = ({ price, estimate }: { price: number; estimate: EstimateSummary | null }) => {
  const { t, currency } = useLanguage();
  const fp = useFormatPrice();
  if (!estimate || !price || estimate.currency !== currency) return null;
  if (estimate.min_price === estimate.max_price) return null;
  if (price < estimate.min_price) {
    return (
      <p className="text-xs text-amber-600 mt-1.5 flex items-start gap-1">
        <span>⚠</span>
        <span>{t("price.feedback.low").replace("{min}", fp(estimate.min_price, currency, currency)).replace("{max}", fp(estimate.max_price, currency, currency))}</span>
      </p>
    );
  }
  if (price > estimate.max_price) {
    return <p className="text-xs text-primary mt-1.5 flex items-start gap-1"><span>✓</span><span>{t("price.feedback.high")}</span></p>;
  }
  return null;
};
