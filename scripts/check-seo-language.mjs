#!/usr/bin/env node
/**
 * SEO language-mixing linter.
 *
 * Scans all published rows in `seo_pages` and verifies that each per-language
 * column (title_*, h1_*, meta_*, content_*, plus FAQ Q/A) is written in the
 * expected script. Catches authoring mistakes like a Russian h1 sneaking into
 * the `_en` column or English chrome bleeding into `_he` content — which is
 * what produces the visible language-mixing on EN/RU/HE/AR SEO pages.
 *
 * Run:
 *   node scripts/check-seo-language.mjs
 *
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY in env (already
 * present in .env). Exits non-zero if any mixed-script row is detected.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const matchers = {
  en: /[A-Za-z]/g,
  ru: /[\u0400-\u04FF]/g,
  he: /[\u0590-\u05FF]/g,
  ar: /[\u0600-\u06FF]/g,
};

/** True if at least 50% of alphabetic characters in `value` use the locale's script. */
function isInScript(value, locale) {
  if (!value) return true;
  const text = String(value);
  const alpha = text.replace(/[\d\s\p{P}\p{S}]/gu, "");
  if (alpha.length === 0) return true;
  const m = alpha.match(matchers[locale]);
  return (m ? m.join("").length : 0) / alpha.length >= 0.5;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const { data: rows, error } = await supabase
  .from("seo_pages")
  .select(
    "slug, page_type, title_en, title_ru, title_he, meta_en, meta_ru, meta_he, h1_en, h1_ru, h1_he, content_en, content_ru, content_he, faq",
  )
  .eq("is_published", true);

if (error) {
  console.error("Failed to load seo_pages:", error.message);
  process.exit(1);
}

const issues = [];
const langs = ["en", "ru", "he"];
const fields = ["title", "meta", "h1", "content"];

for (const r of rows ?? []) {
  for (const lang of langs) {
    for (const f of fields) {
      const val = r[`${f}_${lang}`];
      if (val && !isInScript(val, lang)) {
        issues.push(
          `[${r.slug}] ${f}_${lang}: not in expected script — "${String(val).slice(0, 60).replace(/\s+/g, " ")}…"`,
        );
      }
    }
  }
  // FAQ rows
  if (Array.isArray(r.faq)) {
    r.faq.forEach((q, i) => {
      for (const lang of langs) {
        for (const k of ["question", "answer"]) {
          const val = q?.[`${k}_${lang}`];
          if (val && !isInScript(val, lang)) {
            issues.push(
              `[${r.slug}] faq[${i}].${k}_${lang}: not in expected script — "${String(val).slice(0, 60).replace(/\s+/g, " ")}…"`,
            );
          }
        }
      }
    });
  }
}

console.log(`Scanned ${rows?.length ?? 0} published seo_pages rows.`);
if (issues.length === 0) {
  console.log("✅ No language-mixing issues found in seo_pages content.");
  process.exit(0);
}
console.log(`\n❌ Found ${issues.length} mixed-script issue(s):`);
for (const m of issues) console.log("  - " + m);
process.exit(1);