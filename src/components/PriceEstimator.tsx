import { useEffect, useState } from "react";
import { Lightbulb, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";

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
  onUseSuggested: (price: number) => void;
  onEstimate?: (e: Estimate | null) => void;
}

export const PriceEstimator = ({ city, category, title, description, onUseSuggested, onEstimate }: Props) => {
  const { t, locale } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState(false);

  // Debounce inputs
  useEffect(() => {
    const ready = (title.trim().length >= 3 || description.trim().length >= 10) && !!category;
    if (!ready) {
      setEstimate(null);
      return;
    }
    setError(false);
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
        }
      } catch {
        setError(true);
        setEstimate(null);
        onEstimate?.(null);
      } finally {
        setLoading(false);
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [city, category, title, description, locale]);

  if (!estimate && !loading) return null;

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

      {estimate && !loading && (
        <>
          <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            ₪{estimate.min_price.toLocaleString()} – ₪{estimate.max_price.toLocaleString()}
          </div>
          <div className="text-sm text-foreground">
            <span className="font-medium">{t("price.estimate.recommended")}: </span>
            <span className="font-bold text-primary">
              ₪{estimate.recommended_price.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {estimate.source === "history"
              ? t("price.estimate.basedOn").replace("{n}", String(estimate.sample_size))
              : t("price.estimate.aiBased")}
          </p>
          <button
            type="button"
            onClick={() => onUseSuggested(estimate.recommended_price)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity text-sm"
          >
            <Sparkles className="w-4 h-4" />
            {t("price.estimate.useSuggested")}
          </button>
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
