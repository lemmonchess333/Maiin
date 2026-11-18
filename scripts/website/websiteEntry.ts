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
 */
export const WEBSITE_HTML = "website.html";

/** The page's name in the Hosting build's output. */
export const WEBSITE_OUTPUT = "index.html";

/** Builds `website.html` as the output's index.html when `enabled` (a
 *  Firebase Hosting build), and does nothing otherwise. */
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
    },
  };
}
