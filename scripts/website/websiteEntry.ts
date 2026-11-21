import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * The Firebase Hosting build is the website, not the app (App1 Q52, owner
 * 15 November 2026): troposfit.com points to the App Store, and the
 * browser app stays on the GitHub Pages preview, whose build is unchanged.
 *
 * `website.html` (src/website/main.tsx) is the Hosting build's one page.
 * Hosting answers `/` and every rewrite with `index.html`
 * (firebase.json), and `publicPostPage` fetches `/index.html` as a shared
 * post's page (functions/lib/publicPost.js), so the page is written out
 * under that name. No app page is built, so nothing on troposfit.com
 * loads the app.
 *
 * Nor does the app's `public/` folder ship whole: only what the website
 * and its kept addresses use (`WEBSITE_PUBLIC_DIRS`, `WEBSITE_PUBLIC_ART`),
 * and the worker
 * that retires the app's service worker at both of its addresses
 * (`RETIRED_WORKER_PATHS`, scripts/website/retired-sw.js). The exercise
 * pictures, badges, medals and the rest stay with the app.
 */
export const WEBSITE_HTML = "website.html";

/** The page's name in the Hosting build's output. */
export const WEBSITE_OUTPUT = "index.html";

/** The folders of `public/` the website serves: its icons (the tab's
 *  icon, and the preview picture a page and a post's link name) and the
 *  static copies of the legal pages (docs/public-legal-pages.md). */
export const WEBSITE_PUBLIC_DIRS = ["icons", "legal"] as const;

/** Where the app's service workers were registered from on this origin:
 *  the current one, and the one before it (public/firebase-messaging-sw.js),
 *  which an older registration may still name. */
export const RETIRED_WORKER_PATHS = [
  "sw.js",
  "firebase-messaging-sw.js",
] as const;

/** The retiring worker's source, beside this file. */
export const RETIRED_WORKER_SOURCE = "scripts/website/retired-sw.js";

/** Single files of `public/` the website's own pages draw: the app's
 *  drawings of a lift, a runner and food, and one challenge's medals.
 *  Their folders stay with the app (form-art alone is 20 MB);
 *  prerender.test.tsx holds every picture a page names to this list. */
export const WEBSITE_PUBLIC_ART = [
  "form-art/overhead-press.webp",
  "form-art/run-fast.webp",
  "form-art/run-easy.webp",
  "form-art/squat.webp",
  "form-art/bench-press.webp",
  "form-art/deadlift.webp",
  "form-art/pull-ups.webp",
  "form-art/romanian-deadlift.webp",
  "form-art/lateral-raise.webp",
  "food-art/bowl.webp",
  "food-art/eggs.webp",
  "food-art/salad.webp",
  "food-art/protein.webp",
  "food-art/fruit.webp",
  "food-art/bread.webp",
  "food-art/plate.webp",
  "food-art/drink.webp",
  "food-art/grains.webp",
  "medals/active-days-bronze.webp",
  "medals/active-days-silver.webp",
  "medals/active-days-gold.webp",
] as const;

/** The files of `public/` the website ships, relative to it. */
export function websitePublicFiles(publicDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const relative = `${rel}/${name}`;
      if (statSync(full).isDirectory()) walk(full, relative);
      else files.push(relative);
    }
  };
  for (const dir of WEBSITE_PUBLIC_DIRS) walk(path.join(publicDir, dir), dir);
  for (const file of WEBSITE_PUBLIC_ART) {
    statSync(path.join(publicDir, file));
    files.push(file);
  }
  return files;
}

/** Builds `website.html` as the output's index.html when `enabled` (a
 *  Firebase Hosting build), with only the website's public files, and
 *  does nothing otherwise. */
export function websiteEntryPlugin(root: string, enabled: boolean): Plugin {
  let ssr = false;
  return {
    name: "tropos-website-entry",
    apply: "build",
    // After Vite's own HTML plugin, which adds the page to the bundle.
    enforce: "post",
    config(_config, env) {
      // The build that draws each page at build time (prerender.ts) is a
      // server build of its own entry, not the page.
      ssr = env?.isSsrBuild === true;
      if (!enabled || ssr) return;
      return {
        build: {
          copyPublicDir: false,
          rolldownOptions: {
            input: { website: path.resolve(root, WEBSITE_HTML) },
          },
        },
      };
    },
    generateBundle(_options, bundle) {
      if (!enabled || ssr) return;
      const page = bundle[WEBSITE_HTML];
      if (!page || page.type !== "asset") {
        this.error(`the Hosting build made no ${WEBSITE_HTML}`);
      }
      if (bundle[WEBSITE_OUTPUT]) {
        this.error(
          `the Hosting build made an app ${WEBSITE_OUTPUT} beside the website`
        );
      }
      delete bundle[WEBSITE_HTML];
      this.emitFile({
        type: "asset",
        fileName: WEBSITE_OUTPUT,
        source: page.source,
      });
      const publicDir = path.resolve(root, "public");
      for (const fileName of websitePublicFiles(publicDir)) {
        this.emitFile({
          type: "asset",
          fileName,
          source: readFileSync(path.join(publicDir, fileName)),
        });
      }
      const worker = readFileSync(
        path.resolve(root, RETIRED_WORKER_SOURCE),
        "utf8"
      );
      for (const fileName of RETIRED_WORKER_PATHS) {
        this.emitFile({ type: "asset", fileName, source: worker });
      }
    },
  };
}
