#!/usr/bin/env node
/**
 * i18n linter: ensures every translation key exists in EN/RU/HE/AR
 * and flags suspicious untranslated values (identical to EN in another locale).
 * Run: node scripts/check-i18n.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, "../src/i18n/translations.ts");
const src = readFileSync(file, "utf8");

const LOCALES = ["en", "ru", "he", "ar"];
const blocks = {};
for (const loc of LOCALES) {
  const re = new RegExp(`\\b${loc}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\s*[,}]`);
  const m = src.match(re);
  if (!m) { console.error(`Missing locale block: ${loc}`); process.exit(1); }
  const map = {};
  for (const line of m[1].split("\n")) {
    const km = line.match(/['"]([\w.\-]+)['"]\s*:\s*(['"`])([\s\S]*?)\2\s*,?$/);
    if (km) map[km[1]] = km[3];
  }
  blocks[loc] = map;
}

const allKeys = new Set();
for (const loc of LOCALES) for (const k of Object.keys(blocks[loc])) allKeys.add(k);

const missing = [];
const untranslated = [];
for (const key of allKeys) {
  for (const loc of LOCALES) {
    if (!(key in blocks[loc])) missing.push(`${loc}: ${key}`);
    else if (loc !== "en" && blocks[loc][key] && blocks.en[key] && blocks[loc][key] === blocks.en[key]
             && !/^[\W\d_]+$/.test(blocks.en[key])) {
      untranslated.push(`${loc}: ${key} = "${blocks.en[key]}"`);
    }
  }
}

console.log(`Locales scanned: ${LOCALES.join(", ")}`);
console.log(`Total unique keys: ${allKeys.size}`);
if (missing.length) {
  console.log(`\n❌ Missing keys (${missing.length}):`);
  for (const m of missing) console.log("  - " + m);
}
if (untranslated.length) {
  console.log(`\n⚠️  Likely untranslated (${untranslated.length}):`);
  for (const u of untranslated.slice(0, 50)) console.log("  - " + u);
  if (untranslated.length > 50) console.log(`  …and ${untranslated.length - 50} more`);
}
if (missing.length) process.exit(1);
console.log("\n✅ i18n check passed");