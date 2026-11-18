/**
 * The website's pages as HTML, written by the build (scripts/website/
 * prerender.ts runs this through Vite's server build, so the pictures
 * have the same hashed addresses as in the browser's build). Each page is
 * a file of its own on Firebase Hosting, readable with no script at all,
 * with its own title, description and preview picture.
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { APP_STORE_URL } from "@/lib/publicLinks";
import SitePage from "@/website/pages/SitePage";

export { SITE_ORIGIN, SITE_PAGES, sitePageFile } from "@/website/site/pages";
export { SITE_ART_FILES } from "@/website/site/art";

/** The markup inside `#root` for the page at `path`. */
export function renderSitePage(path: string): string {
  return renderToString(
    createElement(
      StaticRouter,
      { location: path },
      createElement(SitePage, { path })
    )
  );
}

/** Tropos's App Store id, for Safari's Smart App Banner. */
export const APP_STORE_ID = APP_STORE_URL.match(/id(\d+)$/)?.[1] ?? "";
