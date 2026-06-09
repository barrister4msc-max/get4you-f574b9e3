import { useEffect, useState } from "react";
import { Lightbulb, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { useFormatPrice } from "@/hooks/useFormatPrice";

interface Estimate {
  source: "history" | "ai" | "none";
  scope?: "city" | "global" | "ai";
  sample_size: number;
  min_price: number;
  max_price: number;
  recommended_price: number;
  currency: string;
  confidence?: "low" | "medium" | "high";
}

interface Props {
  city: string;
  category: string;
  title: string;
  description: string;
  /** Receives the suggested price already converted to the user's display currency. */
  onUseSuggested: (price: number) => void;
  onEstimate?: (e: Estimate | null) => void;
}

export const PriceEstimator = ({ city, category, title, description, onUseSuggested, onEstimate }: Props) => {
  const { t, locale, currency, rates } = useLanguage();
  const fp = useFormatPrice();
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Debounce inputs
  useEffect(() => {
    const ready = (title.trim().length >= 3 || description.trim().length >= 10) && !!category;
    if (!ready) {
      setEstimate(null);
      setUnavailable(false);
      return;
    }
    setUnavailable(false);
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error: err } = await supabase.functions.invoke("estimate-task-price", {
          body: { city, category, title, description, userLocale: locale },
        });
        if (err) throw err;
        if (data && (data.recommended_price ?? 0) > 0) {
          setEstimate(data as Estimate);
          onEstimate?.(data as Estimate);
        } else {
          setEstimate(null);
          onEstimate?.(null);
          setUnavailable(true);
        }
      } catch {
        setEstimate(null);
        onEstimate?.(null);
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [city, category, title, description, locale]);

  if (!estimate && !loading && !unavailable) return null;

  // Convert ILS-sourced estimate to the user's display currency.
  const srcCurrency = estimate?.currency || "ILS";
  const ilsRate = rates?.ILS ?? 3.7;
  const toDisplay = (amountInSrc: number) => {
    if (!estimate) return 0;
    const inUsd = srcCurrency.toUpperCase() === "ILS" ? amountInSrc / ilsRate : amountInSrc;
    if (currency === "ILS") return Math.round(inUsd * ilsRate);
    return Math.round(inUsd);
  };
  const displayMin = estimate ? toDisplay(estimate.min_price) : 0;
  const displayMax = estimate ? toDisplay(estimate.max_price) : 0;
  const displayRec = estimate ? toDisplay(estimate.recommended_price) : 0;

  return (
    <div className="rounded-2xl border border-primary/20 bg-emerald-50/50 p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2 text-primary">
        <Lightbulb className="w-5 h-5 shrink-0" />
        <h3 className="text-sm sm:text-base font-semibold">{t("price.estimate.title")}</h3>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("price.estimate.loading")}
        </div>
      )}

      {!loading && unavailable && !estimate && (
        <p className="text-sm text-muted-foreground">
          {t("price.estimate.unavailable") || "Suggested price is not available yet"}
        </p>
      )}

      {estimate && !loading && displayRec > 0 && (
        <>
          <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            {fp(displayMin, currency, currency)} – {fp(displayMax, currency, currency)}
          </div>
          <div className="text-sm text-foreground">
            <span className="font-medium">{t("price.estimate.recommended")}: </span>
            <span className="font-bold text-primary">
              {fp(displayRec, currency, currency)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {estimate.source === "history"
              ? t("price.estimate.basedOn").replace("{n}", String(estimate.sample_size))
              : t("price.estimate.aiBased")}
          </p>
          {displayRec > 0 && (
            <button
              type="button"
              onClick={() => onUseSuggested(displayRec)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity text-sm"
            >
              <Sparkles className="w-4 h-4" />
              {t("price.estimate.useSuggested")}
            </button>
          )}
        </>
      )}
    </div>
  );
};

interface FeedbackProps {
  price: number;
  estimate: Estimate | null;
}

export const PriceFeedback = ({ price, estimate }: { price: number; estimate: Pick<Estimate, "min_price" | "max_price"> | null }) => {
  const { t } = useLanguage();
  if (!estimate || !price) return null;
  if (price < estimate.min_price) {
    return (
      <p className="text-xs text-amber-600 mt-1.5 flex items-start gap-1">
        <span>⚠</span>
        <span>
          {t("price.feedback.low").replace("{min}", `₪${estimate.min_price}`).replace("{max}", `₪${estimate.max_price}`)}
        </span>
      </p>
    );
  }
  if (price > estimate.max_price) {
    return (
      <p className="text-xs text-primary mt-1.5 flex items-start gap-1">
        <span>✓</span>
        <span>{t("price.feedback.high")}</span>
      </p>
    );
  }
  return null;
};
