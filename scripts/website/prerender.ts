/**
 * Writes troposfit.com's pages into the Hosting build (`npm run
 * build:hosting`, after Vite has built `website.html` as dist/index.html).
 *
 * Each page becomes a file of its own, with its own head, and its markup
 * in `#root` (`sitePage.ts`): `/` is dist/index.html, `/lifting` is
 * dist/lifting/index.html, which firebase.json's `trailingSlash: false`
 * serves at `/lifting`, and the missing page is dist/404.html. Then the
 * sitemap, robots.txt, the preview pictures (/og/) and the press kit's
 * files (/press-kit/).
 *
 * The pages are drawn by `src/website/prerender.ts`, built by Vite for
 * the server with the browser build's own settings, so a picture has the
 * same hashed address in both.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";
import { robots, sitemap, writePage, type PageForHead } from "./sitePage.ts";

const root = path.resolve(import.meta.dirname, "../..");
const dist = path.join(root, "dist");
const ssrOut = path.join(root, "node_modules/.cache/tropos-website-ssr");

interface PrerenderModule {
  SITE_ORIGIN: string;
  SITE_PAGES: readonly PageForHead[];
  sitePageFile: (page: PageForHead) => string;
  renderSitePage: (path: string) => string;
  APP_STORE_ID: string;
  SITE_ART_FILES: readonly string[];
}

async function buildRenderer(): Promise<PrerenderModule> {
  await rm(ssrOut, { recursive: true, force: true });
  await build({
    configFile: false,
    root,
    base: "/",
    mode: "production",
    logLevel: "warn",
    define: {
      __APP_VERSION__: JSON.stringify(
        process.env.npm_package_version || "1.1.0"
      ),
    },
    resolve: { alias: { "@": path.join(root, "src") } },
    plugins: [react()],
    build: {
      ssr: "src/website/prerender.ts",
      outDir: ssrOut,
      emptyOutDir: true,
      copyPublicDir: false,
      minify: false,
      // The browser build's rule (vite.config.ts), so a small picture is
      // inlined, or not, the same way in both.
      assetsInlineLimit: (file: string) =>
        /\.(woff2?|ttf|otf|eot)$/i.test(file) ? false : undefined,
      rolldownOptions: { output: { entryFileNames: "prerender.mjs" } },
    },
  });
  return (await import(
    pathToFileURL(path.join(ssrOut, "prerender.mjs")).href
  )) as PrerenderModule;
}

async function main() {
  const template = await readFile(path.join(dist, "index.html"), "utf8");
  const site = await buildRenderer();
  for (const page of site.SITE_PAGES) {
    const html = writePage(
      template,
      page,
      site.renderSitePage(page.path),
      site.SITE_ORIGIN,
      site.APP_STORE_ID
    );
    const file = path.join(dist, site.sitePageFile(page));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);
  }
  const indexed = site.SITE_PAGES.filter((p) => p.kind !== "notFound").map(
    (p) => p.path
  );
  await writeFile(
    path.join(dist, "sitemap.xml"),
    sitemap(site.SITE_ORIGIN, indexed)
  );
  await writeFile(path.join(dist, "robots.txt"), robots(site.SITE_ORIGIN));
  const statics = path.join(root, "src/website/static");
  await cp(path.join(statics, "og"), path.join(dist, "og"), {
    recursive: true,
  });
  await cp(path.join(statics, "press"), path.join(dist, "press-kit"), {
    recursive: true,
  });
  // The app's drawings the pages show: the Hosting build ships only the
  // website's part of public/ (websiteEntry.ts), so these come by name.
  for (const file of site.SITE_ART_FILES) {
    await mkdir(path.dirname(path.join(dist, file)), { recursive: true });
    await cp(path.join(root, "public", file), path.join(dist, file));
  }
  await rm(ssrOut, { recursive: true, force: true });
  console.log(`website: ${site.SITE_PAGES.length} pages written`);
}

await main();
