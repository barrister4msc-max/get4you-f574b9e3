import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { Lightbulb, Loader2, Sparkles, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useLanguage } from "@/i18n/LanguageContext";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { categoryIdFor, resolveServiceKey } from "@/lib/serviceRegistry";
import {
  estimateKey, parseEstimateResponse, estimateConversionRate, convertEstimateAmount, type EstimateParams, type EstimateResult,
} from "../../supabase/functions/_shared/priceEstimate";
import { PRICE_SUMMARY_TTL_MS, summaryIsFresh } from "../../supabase/functions/_shared/webPrices";

/** Shape consumed by PriceFeedback; only produced from an "available" estimate. */
export type EstimateSummary = { min_price: number; max_price: number; recommended_price: number; currency: string };

type L = "en" | "ru" | "he" | "ar";
const TXT: Record<string, Record<L, string>> = {
  title: { en: "Service cost", ru: "Стоимость услуги", he: "עלות השירות", ar: "تكلفة الخدمة" },
  tariff: { en: "Calculated by tariff", ru: "Расчёт по тарифу", he: "חישוב לפי תעריף", ar: "محسوب حسب التعرفة" },
  history: { en: "Estimate from {n} comparable completed orders", ru: "Оценка по {n} сопоставимым выполненным заказам", he: "הערכה לפי {n} הזמנות דומות שהושלמו", ar: "تقدير من {n} طلبات مكتملة مماثلة" },
  range: { en: "Middle half of final prices; recommended = median.", ru: "Средняя половина итоговых цен; рекомендуемая — медиана.", he: "מחצית אמצעית של המחירים הסופיים; מומלץ = חציון.", ar: "النصف الأوسط من الأسعار النهائية؛ الموصى به = الوسيط." },
  unavailable: { en: "Automatic estimate is not available yet", ru: "Автооценка пока недоступна", he: "הערכה אוטומטית עדיין לא זמינה", ar: "التقدير التلقائي غير متاح بعد" },
  how: { en: "How it was calculated", ru: "Как рассчитано", he: "איך חושב", ar: "كيف تم الحساب" },
  checked: { en: "Checked", ru: "Проверено", he: "נבדק", ar: "تم التحقق" },
  conversionError: { en: "Currency conversion is unavailable. Prices are shown in ILS; retry to apply in USD.", ru: "Конвертация недоступна. Цены показаны в ILS; повторите, чтобы применить сумму в USD.", he: "המרת המטבע אינה זמינה. המחירים מוצגים בשקלים; נסו שוב כדי להחיל בדולרים.", ar: "تحويل العملة غير متاح. الأسعار بالشيكل؛ أعد المحاولة للتطبيق بالدولار." },
  geoCity: { en: "Sources for", ru: "Источники по", he: "מקורות עבור", ar: "مصادر لـ" },
  formula: { en: "Recommended = (minimum + maximum) / 2", ru: "Рекомендуемая = (минимальная + максимальная) / 2", he: "מומלץ = (מינימום + מקסימום) / 2", ar: "الموصى به = (الأدنى + الأعلى) / 2" },
  error: { en: "Could not load the estimate.", ru: "Не удалось получить оценку.", he: "לא ניתן לטעון הערכה.", ar: "تعذر تحميل التقدير." },
  limit: { en: "Price updates are paused: workspace spending limit reached.", ru: "Обновление цен приостановлено: достигнут лимит расходов рабочего пространства.", he: "עדכון המחירים הושהה: הגעתם למגבלת ההוצאות של סביבת העבודה.", ar: "تحديث الأسعار متوقف: تم الوصول إلى حد إنفاق مساحة العمل." },
  retry: { en: "Retry", ru: "Повторить", he: "נסה שוב", ar: "إعادة المحاولة" },
  use: { en: "Use this price", ru: "Использовать эту цену", he: "השתמש במחיר זה", ar: "استخدم هذا السعر" },
  loading: { en: "Calculating…", ru: "Считаем…", he: "מחשב…", ar: "جارٍ الحساب…" },
  rec: { en: "Recommended price", ru: "Рекомендуемая цена", he: "מחיר מומלץ", ar: "السعر الموصى به" },
};

interface Props {
  category: string;
  serviceDetails: Record<string, unknown>;
  cityId: string | null;
  neighborhoodId: string | null;
  /** Public Hebrew city name for internet price research (never the address). */
  cityNameHe?: string | null;
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
    additionalWork: typeof sd.wishes === "string" && sd.wishes.trim().length > 0,
    cityId, neighborhoodId,
  };
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cacheGet = (k: string): EstimateResult | null => {
  try {
    const raw = sessionStorage.getItem(`price_est_v2:${k}`);
    if (!raw) return null;
    const { at, r } = JSON.parse(raw);
    if (r.method === "web" && !summaryIsFresh(new Date(Date.parse(r.provenance.checkedAt) + PRICE_SUMMARY_TTL_MS).toISOString())) return null;
    return Date.now() - at < CACHE_TTL_MS ? parseEstimateResponse(r) : null;
  } catch { return null; }
};
const cacheSet = (k: string, r: EstimateResult) => {
  try { if (r.status === "available") sessionStorage.setItem(`price_est_v2:${k}`, JSON.stringify({ at: Date.now(), r })); } catch { /* ignore */ }
};

export const PriceEstimator = ({ category, serviceDetails, cityId, neighborhoodId, cityNameHe, onUseSuggested, onEstimate }: Props) => {
  const { locale, currency } = useLanguage();
  const loc = (["en", "ru", "he", "ar"].includes(locale) ? locale : "en") as L;
  const fp = useFormatPrice();
  const params = buildEstimateParams(category, serviceDetails || {}, cityId, neighborhoodId, currency);
  const key = params ? `${estimateKey(params)}|${cityNameHe ?? ""}` : null;
  const [state, setState] = useState<{ key: string; result: EstimateResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [conversion, setConversion] = useState<{ key: string; rate: number; checkedAt?: number } | null>(null);
  const seq = useRef(0);
  const onEstimateRef = useRef(onEstimate);
  onEstimateRef.current = onEstimate;

  useEffect(() => {
    const my = ++seq.current;
    onEstimateRef.current?.(null); // previous estimate is no longer current
    if (!params || !key) { setState(null); setLoading(false); return; }
    const ctrl = new AbortController();
    const cached = cacheGet(key);
    const report = (result: EstimateResult) => {
      if (result.status === "available") {
        onEstimateRef.current?.(result.method === "tariff"
          ? { min_price: result.total, max_price: result.total, recommended_price: result.total, currency: result.currency }
          : { min_price: result.min, max_price: result.max, recommended_price: result.recommended, currency: result.currency });
      }
    };
    if (cached && retry === 0 && currency === "ILS") { setConversion({ key, rate: 1 }); setState({ key, result: cached }); setLoading(false); report(cached); return; }
    setLoading(true);
    const h = setTimeout(async () => {
      let result: EstimateResult;
      try {
        const [response, exchange] = await Promise.all([cached ? Promise.resolve({ data: cached, error: null }) : supabase.functions.invoke("estimate-task-price", {
          body: { service: params.service, category_id: categoryIdFor(params.service), subtype: params.subtype,
            area_m2: params.areaM2, windows: params.windows, additional_work: params.additionalWork, city_id: params.cityId, neighborhood_id: params.neighborhoodId, currency: "ILS", city_name_he: cityNameHe ?? null },
          signal: ctrl.signal,
        }), currency === "USD" ? supabase.functions.invoke("exchange-rates", { signal: ctrl.signal }) : Promise.resolve(null)]);
        const rate = currency === "ILS" ? 1 : exchange && !exchange.error ? estimateConversionRate(exchange.data) : null;
        result = response.error ? { status: "error", reason: "request_failed" } : parseEstimateResponse(response.data);
        if (response.error instanceof FunctionsHttpError) {
          try { result = parseEstimateResponse(await response.error.context.json()); } catch { /* retain failure */ }
        }
        if (ctrl.signal.aborted || my !== seq.current) return;
        setConversion(rate !== null ? { key, rate, checkedAt: exchange?.data?.fetchedAt } : null);
        if (result.status === "available" && rate !== null) {
          const rec = result.method === "tariff" ? result.total : result.recommended;
          onEstimateRef.current?.({ min_price: convertEstimateAmount(result.method === "tariff" ? rec : result.min, rate), max_price: convertEstimateAmount(result.method === "tariff" ? rec : result.max, rate), recommended_price: convertEstimateAmount(rec, rate), currency });
        }
      } catch {
        result = { status: "error", reason: "request_failed" };
      }
      if (ctrl.signal.aborted || my !== seq.current) return; // stale response
      cacheSet(key, result);
      setState({ key, result });
      setLoading(false);
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
          <span className="text-destructive">{current.reason.toLowerCase().includes("credit limit") ? TXT.limit[loc] : TXT.error[loc]}</span>
          <Button variant="ghost" type="button" onClick={() => setRetry((r) => r + 1)} className="inline-flex items-center gap-1 text-primary underline">
            <RotateCw className="w-3.5 h-3.5" />{TXT.retry[loc]}
          </Button>
        </div>
      )}
      {!loading && current?.status === "available" && (() => {
        const rate = conversion?.key === key ? conversion.rate : null;
        const cur = rate === null ? "ILS" : currency;
        const displayRate = rate ?? 1;
        const display = (n: number) => fp(convertEstimateAmount(n, displayRate), cur, cur);
        const rec = convertEstimateAmount(current.method === "tariff" ? current.total : current.recommended, displayRate);
        return (
          <>
            {current.method === "tariff" || current.min === current.max ? (
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{fp(rec, cur, cur)}</div>
            ) : (
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{display(current.min)} — {display(current.max)}</div>
            )}
            <div className="text-base"><span className="font-medium">{TXT.rec[loc]}: </span><span className="font-bold text-primary">{fp(rec, cur, cur)}</span></div>
            {rate === null && <div className="text-sm text-destructive flex flex-wrap items-center gap-2"><span>{TXT.conversionError[loc]}</span><Button type="button" variant="ghost" onClick={() => setRetry((r) => r + 1)}><RotateCw className="w-4 h-4" />{TXT.retry[loc]}</Button></div>}
            {cur === currency && (
              <Button variant="ghost" type="button" onClick={() => onUseSuggested(rec)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity text-sm">
                <Sparkles className="w-4 h-4" />{TXT.use[loc]}
              </Button>
            )}
            <details className="text-sm text-muted-foreground" data-testid="price-how">
              <summary className="cursor-pointer text-primary font-medium">{TXT.how[loc]}</summary>
              <div className="mt-2 space-y-2">
                {current.method === "web" ? (
                  <>
                    <p>{TXT.geoCity[loc]}: {current.provenance.area} · {TXT.checked[loc]}: {new Date(current.provenance.checkedAt).toLocaleDateString(locale)}</p>
                    <ul className="space-y-1.5">
                      {current.provenance.offers.map((o, i) => (
                        <li key={i} className="break-words">
                          <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="underline text-primary">{new URL(o.url).hostname}</a>
                          {" — "}«{o.quote}» → {o.calc} = <span className="font-semibold text-foreground">₪{o.normalized}</span>
                        </li>
                      ))}
                    </ul>
                    {current.provenance.search && <div className="space-y-1"><p>OpenAI · Web Search</p><ul>{current.provenance.search.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer nofollow" className="underline text-primary">{source.title || new URL(source.url).hostname}</a></li>)}</ul></div>}
                  </>
                ) : current.method === "history" ? (
                  <p>{TXT.history[loc].replace("{n}", String(current.provenance.sampleSize))}</p>
                ) : (
                  <p>{TXT.tariff[loc]}</p>
                )}
                <p>{TXT.formula[loc]}</p>
                {currency === "USD" && rate !== null && <p>1 ILS = {rate.toFixed(6)} USD · {TXT.checked[loc]}: {conversion?.checkedAt ? new Date(conversion.checkedAt).toLocaleString(locale) : "—"}</p>}
              </div>
            </details>
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
