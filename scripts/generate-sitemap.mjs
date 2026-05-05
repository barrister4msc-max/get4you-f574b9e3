/**
 * Generates public/sitemap.xml as a direct <urlset> from seo_pages.
 * Runs at build time (vite build) and on dev startup.
 * No <sitemapindex>, no Supabase URL exposed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "sitemap.xml");
const SITE = "https://4you.ai";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  "https://emkiekjlxmtnzrgzfdep.supabase.co";
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVta2lla2pseG10bnpyZ3pmZGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NzA1NDIsImV4cCI6MjA5MDA0NjU0Mn0.bilSwoFexDRoJ57zx8Oth2B2BQmV8tuOIB-VAGem5TA";

const STATIC = [
  { path: "/", lastmod: null },
  { path: "/how-it-works", lastmod: null },
  { path: "/for-taskers", lastmod: null },
  { path: "/tasks", lastmod: null },
  { path: "/terms", lastmod: null },
  { path: "/privacy", lastmod: null },
];

function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]),
  );
}

function normPath(p) {
  if (!p) return "/";
  let out = p.startsWith("/") ? p : `/${p}`;
  out = out.replace(/\/{2,}/g, "/");
  if (out.length > 1) out = out.replace(/\/+$/, "");
  return out;
}

async function fetchSeoPages() {
  const url =
    `${SUPABASE_URL}/rest/v1/seo_pages` +
    `?select=slug,canonical_path,updated_at&is_published=eq.true`;
  const res = await fetch(url, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`seo_pages fetch failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function build(rows) {
  const seen = new Set();
  const urls = [];
  for (const u of STATIC) {
    const p = normPath(u.path);
    if (seen.has(p)) continue;
    seen.add(p);
    urls.push({ loc: p === "/" ? SITE : `${SITE}${p}`, lastmod: u.lastmod });
  }
  for (const r of rows) {
    const p = normPath(r.canonical_path || `/${r.slug}`);
    if (seen.has(p)) continue;
    seen.add(p);
    const lastmod = r.updated_at ? r.updated_at.slice(0, 10) : null;
    urls.push({ loc: `${SITE}${p}`, lastmod });
  }
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>${
            u.lastmod ? `\n    <lastmod>${xmlEscape(u.lastmod)}</lastmod>` : ""
          }\n  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;
  return body;
}

export async function generateSitemap() {
  try {
    const rows = await fetchSeoPages();
    const xml = build(rows);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, xml, "utf8");
    console.log(`[sitemap] wrote ${OUT} (${rows.length} seo_pages + ${STATIC.length} static)`);
  } catch (err) {
    console.warn(`[sitemap] generation failed: ${err?.message || err}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateSitemap();
}