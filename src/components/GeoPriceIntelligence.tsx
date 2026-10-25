import { useEffect, useState } from "react";
import {
  formatIls,
  getGeoMarketplacePriceStats,
  type GeoMarketplacePriceStats,
} from "@/lib/geoPriceIntelligence";

type Props = {
  citySlug: string | null;
  categorySlug: string | null;
  cityName: string;
  categoryName: string;
  locale: "en" | "ru" | "he" | "ar";
};

function copy(
  locale: Props["locale"],
  stats: GeoMarketplacePriceStats,
  city: string,
  category: string,
) {
  const low = formatIls(stats.p25_price, locale);
  const high = formatIls(stats.p75_price, locale);
  const median = formatIls(stats.median_price, locale);

  if (locale === "ru") {
    return {
      eyebrow: "Данные маркетплейса Flow4You",
      title: `Сколько стоят ${category.toLowerCase()} в ${city}?`,
      answer: `Типичный диапазон принятых предложений — ${low}–${high}. Медианная цена — ${median}.`,
      evidence: `На основе ${stats.sample_size} принятых предложений за последние 180 дней.`,
    };
  }
  if (locale === "he") {
    return {
      eyebrow: "נתוני שוק של Flow4You",
      title: `כמה עולה ${category} ב${city}?`,
      answer: `טווח ההצעות שהתקבלו בדרך כלל הוא ${low}–${high}. המחיר החציוני הוא ${median}.`,
      evidence: `מבוסס על ${stats.sample_size} הצעות שהתקבלו ב-180 הימים האחרונים.`,
    };
  }
  if (locale === "ar") {
    return {
      eyebrow: "بيانات سوق Flow4You",
      title: `كم تبلغ تكلفة ${category} في ${city}؟`,
      answer: `النطاق المعتاد للعروض المقبولة هو ${low}–${high}. السعر الوسيط هو ${median}.`,
      evidence: `استنادًا إلى ${stats.sample_size} عرضًا مقبولًا خلال آخر 180 يومًا.`,
    };
  }
  return {
    eyebrow: "Flow4You marketplace data",
    title: `How much does ${category.toLowerCase()} cost in ${city}?`,
    answer: `The typical accepted-offer range is ${low}–${high}. The median price is ${median}.`,
    evidence: `Based on ${stats.sample_size} accepted offers from the last 180 days.`,
  };
}

export default function GeoPriceIntelligence({
  citySlug,
  categorySlug,
  cityName,
  categoryName,
  locale,
}: Props) {
  const [stats, setStats] = useState<GeoMarketplacePriceStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStats(null);

    getGeoMarketplacePriceStats(citySlug, categorySlug).then((result) => {
      if (!cancelled) setStats(result);
    });

    return () => {
      cancelled = true;
    };
  }, [citySlug, categorySlug]);

  if (!stats) return null;

  const text = copy(locale, stats, cityName, categoryName);

  return (
    <section
      className="mb-8 rounded-xl border border-border bg-card p-5 md:p-6"
      aria-label={text.title}
      data-geo-source="marketplace_history"
      data-geo-sample-size={stats.sample_size}
    >
      <p className="text-sm font-medium text-muted-foreground mb-2">{text.eyebrow}</p>
      <h2 className="text-2xl font-semibold mb-3">{text.title}</h2>
      <p className="text-lg mb-2">{text.answer}</p>
      <p className="text-sm text-muted-foreground">
        {text.evidence} {locale === "ru" ? "Источник: агрегированные данные Flow4You." : locale === "he" ? "מקור: נתונים מצטברים של Flow4You." : locale === "ar" ? "المصدر: بيانات Flow4You المجمعة." : "Source: aggregated Flow4You marketplace data."}
      </p>
    </section>
  );
}
