import { test, expect } from "@playwright/test";

/**
 * Production language-mismatch guard for SEO city + city/category pages.
 *
 * For each (city, category, language) combo, navigates to the live page on
 * https://4you.ai with `lang` set in localStorage, then asserts:
 *   1. The H1 is in the expected script (no script mixing in headings).
 *   2. The "Tasks/Recent tasks" section heading uses the expected script.
 *   3. The "Popular services" / "Related pages" UI chrome match the language.
 *   4. A clean visual screenshot (toHaveScreenshot) for regression diffing.
 *
 * Run:  PLAYWRIGHT_BASE_URL=https://4you.ai bunx playwright test tests/seo-language.spec.ts
 * Update baselines:  ... --update-snapshots
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://4you.ai";

const CITY_PAGES = ["/tel-aviv", "/haifa", "/netanya"];
const CITY_CATEGORY_PAGES = ["/tel-aviv/cleaning", "/haifa/repair", "/netanya/delivery"];

// Per-language script regex. We require that the H1 + tasks heading
// contain at least one character from the target script and NO character
// from a competing script (e.g. an EN heading must not contain Cyrillic).
const LANG_SCRIPTS = {
  en: { must: /[A-Za-z]/, mustNot: /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF]/ },
  ru: { must: /[\u0400-\u04FF]/, mustNot: /[\u0590-\u05FF\u0600-\u06FF]/ },
  he: { must: /[\u0590-\u05FF]/, mustNot: /[\u0400-\u04FF\u0600-\u06FF]/ },
  ar: { must: /[\u0600-\u06FF]/, mustNot: /[\u0400-\u04FF\u0590-\u05FF]/ },
} as const;

type Lang = keyof typeof LANG_SCRIPTS;
const LANGS: Lang[] = ["en", "ru", "he", "ar"];

function assertScript(label: string, text: string, lang: Lang) {
  const { must, mustNot } = LANG_SCRIPTS[lang];
  expect(text, `${label} (${lang}): expected script characters`).toMatch(must);
  expect(text, `${label} (${lang}): unexpected foreign script`).not.toMatch(mustNot);
}

for (const path of [...CITY_PAGES, ...CITY_CATEGORY_PAGES]) {
  for (const lang of LANGS) {
    test(`SEO ${path} renders in ${lang} without language mixing`, async ({ page }) => {
      await page.addInitScript((code) => {
        try { localStorage.setItem("lang", code); } catch {}
      }, lang);

      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });

      // H1 — main page heading
      const h1 = (await page.locator("h1").first().innerText()).trim();
      assertScript("h1", h1, lang);

      // Section headings (tasks, related, popular services, FAQ)
      const sectionHeadings = await page.locator("h2").allInnerTexts();
      expect(sectionHeadings.length).toBeGreaterThan(0);
      for (const h of sectionHeadings) {
        if (h.trim().length === 0) continue;
        // Skip pure-symbol headings (e.g. "FAQ" is OK in any locale)
        if (/^[\s\p{P}\p{S}A-Z0-9]+$/u.test(h)) continue;
        assertScript("h2", h, lang);
      }

      // Visual regression baseline (per-locale snapshot)
      await expect(page).toHaveScreenshot(
        `${path.replace(/^\//, "").replace(/\//g, "_")}_${lang}.png`,
        { fullPage: true, maxDiffPixelRatio: 0.02 },
      );
    });
  }
}