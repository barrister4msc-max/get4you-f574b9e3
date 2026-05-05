import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SITEMAP_URL = `${SUPABASE_URL}/functions/v1/sitemap`;

const PRIVATE_PATHS = [
  "/dashboard", "/admin", "/login", "/signup", "/reset-password",
  "/auth/", "/profile", "/settings", "/chat/", "/order-chat/",
  "/messages", "/payment-success", "/payment-cancel", "/unsubscribe",
  "/esek-patur", "/contractor-agreement", "/employment-agreement",
];

async function fetchSitemap() {
  const res = await fetch(SITEMAP_URL);
  const body = await res.text();
  return { res, body };
}

Deno.test("sitemap: returns 200 with XML content-type", async () => {
  const { res, body } = await fetchSitemap();
  assertEquals(res.status, 200);
  const ct = res.headers.get("content-type") ?? "";
  assertStringIncludes(ct, "xml");
  assertStringIncludes(body, '<?xml version="1.0"');
  assertStringIncludes(body, "<urlset");
  assertStringIncludes(body, "</urlset>");
});

Deno.test("sitemap: is well-formed XML with balanced <url> tags", async () => {
  const { body } = await fetchSitemap();
  const opens = (body.match(/<url>/g) || []).length;
  const closes = (body.match(/<\/url>/g) || []).length;
  assertEquals(opens, closes);
  assert(opens > 0, "expected at least one <url> entry");
  // Every <loc> must be inside a url block and absolute https URL
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert(locs.length > 0);
  for (const loc of locs) {
    assert(loc.startsWith("https://4you.ai"), `bad loc: ${loc}`);
  }
});

Deno.test("sitemap: omits private routes", async () => {
  const { body } = await fetchSitemap();
  for (const p of PRIVATE_PATHS) {
    assert(!body.includes(`https://4you.ai${p}`), `sitemap leaked private path ${p}`);
  }
});

Deno.test("sitemap: only includes is_published=true seo_pages", async () => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY missing, skipping DB cross-check");
    return;
  }
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
  const supabase = createClient(SUPABASE_URL, serviceKey);

  const { data: published } = await supabase
    .from("seo_pages")
    .select("slug, canonical_path")
    .eq("is_published", true);
  const { data: unpublished } = await supabase
    .from("seo_pages")
    .select("slug, canonical_path")
    .eq("is_published", false);

  const { body } = await fetchSitemap();

  for (const r of published || []) {
    const path = (r as any).canonical_path || `/${(r as any).slug}`;
    assertStringIncludes(body, `https://4you.ai${path}`);
  }
  for (const r of unpublished || []) {
    const path = (r as any).canonical_path || `/${(r as any).slug}`;
    assert(!body.includes(`https://4you.ai${path}`), `unpublished slug leaked: ${path}`);
  }
});

Deno.test("sitemap: lastmod values are valid ISO dates when present", async () => {
  const { body } = await fetchSitemap();
  const lastmods = [...body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  for (const lm of lastmods) {
    assert(!isNaN(Date.parse(lm)), `invalid lastmod: ${lm}`);
  }
});