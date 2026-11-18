/**
 * Draws each of troposfit.com's pages into its own HTML after the Hosting
 * build (`npm run build:hosting`; the website’s design (#3428), "How it is
 * built"). The website is React, so without this every address would
 * answer with an empty page that a script fills in: slow on a phone's
 * first visit, and blank to a link's preview and to any search engine
 * that does not run scripts.
 *
 * It builds `src/website/prerender.tsx` for the server, renders each page
 * in `SITE_PAGES`, and writes it into the Hosting build's own index.html
 * with that page's title, description, canonical address and preview
 * tags: Home over `dist/index.html`, every other page as
 * `dist/<page>/index.html`, which firebase.json's `trailingSlash: false`
 * serves at `/<page>`. Then the 404 (`404.html`, which Hosting serves with
 * a 404 status), sitemap.xml, robots.txt and the preview pictures
 * (`src/website/og/`).
 *
 * `dist/index.html` stays the page Hosting sends for every address of the
 * app's own (firebase.json's last rewrite) and the page publicPostPage
 * fills with a shared post (functions/lib/publicPost.js), so it keeps no
 * canonical address: a post's page would otherwise name Home as itself.
 */
import { build } from "vite";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SitePage } from "../../src/website/sitePages";
import { fillNotFound, fillPage, robotsTxt, sitemapXml } from "./pageHtml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = join(root, "dist");
const serverOut = join(root, "node_modules/.cache/tropos-website-server");

if (process.env.HOSTING_TARGET !== "firebase") {
  throw new Error(
    "prerender.ts draws the Hosting build: run it with HOSTING_TARGET=firebase after `vite build`."
  );
}

await build({
  root,
  logLevel: "warn",
  build: {
    ssr: "src/website/prerender.tsx",
    outDir: serverOut,
    emptyOutDir: true,
    copyPublicDir: false,
    minify: false,
  },
});

const server = (await import(
  pathToFileURL(join(serverOut, "prerender.js")).href
)) as {
  renderPage: (path: string) => Promise<string>;
  SITE_PAGES: readonly SitePage[];
  NOT_FOUND_TITLE: string;
  canonicalUrl: (page: SitePage) => string;
};

const template = readFileSync(join(dist, "index.html"), "utf8");
for (const page of server.SITE_PAGES) {
  const body = await server.renderPage(page.path);
  const html = fillPage(template, page, body, server.canonicalUrl(page));
  const file =
    page.path === "/"
      ? join(dist, "index.html")
      : join(dist, page.path.slice(1), "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

// The 404, over public/404.html (the GitHub Pages preview's redirect,
// which means nothing on Hosting). Any address with no page here draws it.
writeFileSync(
  join(dist, "404.html"),
  fillNotFound(
    template,
    server.NOT_FOUND_TITLE,
    await server.renderPage("/404")
  )
);

writeFileSync(
  join(dist, "sitemap.xml"),
  sitemapXml(server.SITE_PAGES, server.canonicalUrl)
);
writeFileSync(join(dist, "robots.txt"), robotsTxt());

const og = join(root, "src/website/og");
mkdirSync(join(dist, "og"), { recursive: true });
for (const name of readdirSync(og)) {
  if (name.endsWith(".jpg"))
    copyFileSync(join(og, name), join(dist, "og", name));
}

console.log(
  `prerender: ${server.SITE_PAGES.length} pages, sitemap.xml, robots.txt`
);
