import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE = "https://4you.ai";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const staticUrls = [
    "",
    "how-it-works",
    "for-taskers",
    "tasks",
    "terms",
    "privacy",
  ];

  const { data: seoPages, error: seoError } = await supabase
    .from("seo_pages")
    .select("slug, canonical_path, updated_at")
    .eq("is_published", true);

  if (seoError) {
    return new Response(`<!-- ${seoError.message} -->`, {
      status: 500,
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  }

  const { data: tasks, error: tasksError } = await supabase.rpc(
    "get_public_tasks_seo"
  );

  console.log("TASKS:", tasks?.length);

  if (tasksError) {
    console.error("Tasks sitemap error:", tasksError);
  }

  const urls: Array<{
    loc: string;
    lastmod?: string | null;
    changefreq?: string;
    priority?: string;
  }> = [
    ...staticUrls.map((p) => ({
      loc: p ? `${SITE}/${p}` : SITE,
      lastmod: null,
      changefreq: "weekly",
      priority: p === "" ? "1.0" : "0.8",
    })),

    ...(seoPages || []).map((r: any) => ({
      loc: `${SITE}${r.canonical_path || `/${r.slug}`}`,
      lastmod: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      changefreq: "weekly",
      priority: "0.8",
    })),

    { loc: `${SITE}/tasks/test-id` },

    ...(tasks || []).map((task: any) => ({
      loc: `${SITE}/tasks/${task.id}`,
      lastmod: task.updated_at ? new Date(task.updated_at).toISOString() : null,
      changefreq: "daily",
      priority: "0.7",
    })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>` +
          `<loc>${u.loc}</loc>` +
          `${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}` +
          `${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}` +
          `${u.priority ? `<priority>${u.priority}</priority>` : ""}` +
          `</url>`
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
