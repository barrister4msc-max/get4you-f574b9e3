import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SITE = "https://4you.ai";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  "https://emkiekjlxmtnzrgzfdep.supabase.co";
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVta2lla2pseG10bnpyZ3pmZGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NzA1NDIsImV4cCI6MjA5MDA0NjU0Mn0.bilSwoFexDRoJ57zx8Oth2B2BQmV8tuOIB-VAGem5TA";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function normPath(value) {
  let out = String(value || "").trim();
  if (!out.startsWith("/")) out = `/${out}`;
  out = out.replace(/\/{2,}/g, "/");
  if (out.length > 1) out = out.replace(/\/+$/, "");
  return out;
}

function labelFromSlug(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return await res.json();
}

async function fetchSeoPages() {
  const select = [
    "slug",
    "canonical_path",
    "city_slug",
    "category_slug",
    "title_en",
    "meta_en",
    "h1_en",
    "content_en",
    "faq",
  ].join(",");
  return fetchJson(
    `${SUPABASE_URL}/rest/v1/seo_pages?select=${select}&is_published=eq.true`,
  );
}

async function fetchGeoStats() {
  try {
    const rows = await fetchJson(
      `${SUPABASE_URL}/rest/v1/geo_marketplace_price_statistics?select=city_slug,category_slug,lookback_days,sample_size,p25_price,median_price,p75_price,currency,period_start,period_end,confidence,source,scope,calculated_at&lookback_days=eq.180&sample_size=gte.10&source=eq.marketplace_history&scope=eq.city_category`,
    );
    const map = new Map();
    for (const row of rows) {
      if (!row?.city_slug || !row?.category_slug) continue;
      map.set(`${row.city_slug}::${row.category_slug}`, row);
    }
    return map;
  } catch (err) {
    // The table does not exist until the GEO migration is applied. Build must
    // remain deploy-safe before that point; SEO shells still render without price claims.
    console.warn(`[seo-prerender] GEO stats unavailable: ${err?.message || err}`);
    return new Map();
  }
}

function neutralFallbackFaq(row) {
  const city = labelFromSlug(row.city_slug) || "your area";
  const category = labelFromSlug(row.category_slug) || "local services";
  return [
    {
      question_en: `How do I find ${category.toLowerCase()} in ${city}?`,
      answer_en: `Post a task with the details and location. Available taskers can send offers, and you can compare the information shown in their profiles before choosing.`
    },
    {
      question_en: "How quickly will I receive offers?",
      answer_en: "Response time varies by service, location, timing and task details. Flow4You does not publish a fixed response-time promise unless it is supported by current marketplace data."
    },
    {
      question_en: "How should I choose a tasker?",
      answer_en: "Compare the offer, profile information, ratings and reviews available on Flow4You, and confirm the task scope before selecting a tasker."
    },
    {
      question_en: "Can payment be protected through escrow?",
      answer_en: "Where escrow is available for the task flow, funds are held until the applicable completion and release conditions are met."
    }
  ];
}

function englishFaq(row) {
  if (Array.isArray(row.faq) && row.faq.length > 0) {
    const usable = row.faq
      .map((item) => ({
        question_en: item?.question_en,
        answer_en: item?.answer_en,
      }))
      .filter((item) => item.question_en && item.answer_en);
    if (usable.length > 0) return usable;
  }
  return neutralFallbackFaq(row);
}

function replaceHead(html, row, canonical, faqSchema, serviceSchema) {
  let out = html;
  const title = escapeHtml(row.title_en || row.h1_en || "Flow4You");
  const meta = escapeHtml(row.meta_en || "Find local service taskers on Flow4You.");

  out = out.replace(/<html\b[^>]*>/i, '<html lang="en">');
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/i,
    `<meta name="description" content="${meta}" />`,
  );
  out = out.replace(
    /<\/head>/i,
    `  <link rel="canonical" href="${escapeHtml(canonical)}" />\n` +
      `  <link rel="alternate" hreflang="en" href="${escapeHtml(canonical)}?lang=en" />\n` +
      `  <link rel="alternate" hreflang="ru" href="${escapeHtml(canonical)}?lang=ru" />\n` +
      `  <link rel="alternate" hreflang="he" href="${escapeHtml(canonical)}?lang=he" />\n` +
      `  <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" />\n` +
      `  <meta property="og:title" content="${title}" />\n` +
      `  <meta property="og:description" content="${meta}" />\n` +
      `  <meta property="og:url" content="${escapeHtml(canonical)}" />\n` +
      `  <script type="application/ld+json">${escapeJsonForHtml(faqSchema)}</script>\n` +
      `  <script type="application/ld+json">${escapeJsonForHtml(serviceSchema)}</script>\n` +
      `</head>`,
  );
  return out;
}

function renderPriceBlock(row, stats) {
  if (!stats) return "";
  const city = labelFromSlug(row.city_slug);
  const category = labelFromSlug(row.category_slug);
  const money = (v) => new Intl.NumberFormat("en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(Number(v));

  return `
    <section data-geo-source="marketplace_history" data-geo-sample-size="${Number(stats.sample_size)}">
      <p>Flow4You marketplace data</p>
      <h2>How much does ${escapeHtml(category.toLowerCase())} cost in ${escapeHtml(city)}?</h2>
      <p>The typical accepted-offer range is ${escapeHtml(money(stats.p25_price))}–${escapeHtml(money(stats.p75_price))}. The median price is ${escapeHtml(money(stats.median_price))}.</p>
      <p>Based on ${Number(stats.sample_size)} accepted offers from the last 180 days. Source: aggregated Flow4You marketplace data.</p>
    </section>`;
}

function renderShell(row, stats) {
  const faq = englishFaq(row);
  const faqHtml = faq.map((item) => `
      <section>
        <h3>${escapeHtml(item.question_en)}</h3>
        <p>${escapeHtml(item.answer_en)}</p>
      </section>`).join("");

  return `<main data-seo-prerender="true">
    <article>
      <h1>${escapeHtml(row.h1_en || row.title_en || "Flow4You")}</h1>
      <div>${escapeHtml(row.content_en || "").replace(/\n/g, "<br />")}</div>
      ${renderPriceBlock(row, stats)}
      <section>
        <h2>FAQ</h2>${faqHtml}
      </section>
    </article>
  </main>`;
}

export async function generateSeoStaticShells() {
  const templatePath = path.join(DIST, "index.html");
  if (!fs.existsSync(templatePath)) {
    console.warn("[seo-prerender] dist/index.html not found; skipping");
    return;
  }

  let rows;
  try {
    rows = await fetchSeoPages();
  } catch (err) {
    console.warn(`[seo-prerender] seo_pages fetch failed: ${err?.message || err}`);
    return;
  }

  const statsMap = await fetchGeoStats();
  const baseHtml = fs.readFileSync(templatePath, "utf8");
  let written = 0;
  let withPrice = 0;

  for (const row of rows) {
    if (!row?.slug) continue;
    const route = normPath(row.canonical_path || `/${row.slug}`);
    if (route === "/") continue;

    const canonical = `${SITE}${route}`;
    const stats = row.city_slug && row.category_slug
      ? statsMap.get(`${row.city_slug}::${row.category_slug}`) || null
      : null;
    if (stats) withPrice += 1;

    const faq = englishFaq(row);
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question_en,
        acceptedAnswer: { "@type": "Answer", text: item.answer_en },
      })),
    };
    const serviceSchema = {
      "@context": "https://schema.org",
      "@type": "Service",
      name: row.h1_en || row.title_en || labelFromSlug(row.category_slug) || "Local service",
      url: canonical,
      provider: {
        "@type": "Organization",
        name: "Flow4You",
        url: SITE,
      },
      ...(row.city_slug
        ? { areaServed: { "@type": "City", name: labelFromSlug(row.city_slug) } }
        : {}),
    };

    let html = replaceHead(baseHtml, row, canonical, faqSchema, serviceSchema);
    html = html.replace('<div id="root"></div>', `<div id="root">${renderShell(row, stats)}</div>`);

    const outDir = path.join(DIST, route.replace(/^\//, ""));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
    written += 1;
  }

  console.log(`[seo-prerender] wrote ${written} static SEO shells (${withPrice} with marketplace price facts)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateSeoStaticShells();
}
