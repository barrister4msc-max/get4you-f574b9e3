import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { generateSitemap } from "./scripts/generate-sitemap.mjs";
import { generateSeoStaticShells } from "./scripts/generate-seo-static-shells.mjs";

function sitemapPlugin() {
  return {
    name: "generate-sitemap",
    apply: undefined as any,
    async buildStart() {
      await generateSitemap();
    },
  };
}

function seoStaticShellsPlugin() {
  return {
    name: "generate-seo-static-shells",
    apply: "build" as const,
    async closeBundle() {
      await generateSeoStaticShells();
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    sitemapPlugin(),
    seoStaticShellsPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
