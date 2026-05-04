import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE = "https://4you.ai";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("seo_pages")
    .select("slug, canonical_path, updated_at")
    .eq("is_published", true);

  if (error) {
    return new Response(`<!-- ${error.message} -->`, {
      status: 500,
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  }

  const staticUrls = ["", "how-it-works", "for-taskers", "tasks", "terms", "privacy"];

  const urls = [
    ...staticUrls.map((p) => ({ loc: `${SITE}/${p}`.replace(/\/$/, "") || SITE, lastmod: null as string | null })),
    ...(data || []).map((r: any) => ({
      loc: `${SITE}${r.canonical_path || `/${r.slug}`}`,
      lastmod: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
});