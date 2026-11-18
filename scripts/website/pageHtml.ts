/**
 * The HTML around a page drawn at build time (`prerender.ts`): the Hosting
 * build's index.html with the page in `#root` and the page's own head,
 * and the sitemap and robots.txt that list the pages. Plain functions, so
 * `pageHtml.test.ts` reads what they write without a build.
 */
import type { SitePage } from "../../src/website/sitePages";

/** troposfit.com (`PUBLIC_APP_ORIGIN`), named here so this file needs
 *  nothing from the app. `pageHtml.test.ts` holds the two together. */
export const SITE_ORIGIN = "https://troposfit.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The tags a search result and a pasted link read. The same family
 *  publicPostPage takes out of the page before it adds a post's own
 *  (functions/lib/publicPost.js, `PREVIEW_META`). */
const PREVIEW_META =
  /<meta\s+(?:name|property)="(?:description|og:[\w:]+|twitter:[\w:]+)"[^>]*>\s*/g;

const ROOT = '<div id="root"></div>';

/**
 * `template` (the built index.html) as the page `page`: its title, its
 * description and preview tags, its canonical address unless it is Home,
 * and `body`, the page drawn, in `#root`, marked with the page's key so
 * the browser knows it may take the HTML over (`main.tsx`).
 */
export function fillPage(
  template: string,
  page: SitePage,
  body: string,
  canonical: string
): string {
  if (template.split(ROOT).length !== 2) {
    throw new Error(`the template has no single ${ROOT}`);
  }
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const url = escapeHtml(canonical);
  const image = escapeHtml(SITE_ORIGIN + page.image);
  const tags = [
    `<meta name="description" content="${description}" />`,
    `<meta property="og:site_name" content="Tropos" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    ...(page.path === "/" ? [] : [`<link rel="canonical" href="${url}" />`]),
  ].join("\n    ");
  return template
    .replace(PREVIEW_META, "")
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace("</head>", `    ${tags}\n  </head>`)
    .replace(
      ROOT,
      () => `<div id="root" data-page="${page.key}">${body}</div>`
    );
}

/**
 * `template` as the 404, which Hosting serves with a 404 status for any
 * address firebase.json does not send elsewhere: the page drawn, its
 * title, no description, preview or canonical address, and a word to
 * search engines not to keep it.
 */
export function fillNotFound(
  template: string,
  title: string,
  body: string
): string {
  if (template.split(ROOT).length !== 2) {
    throw new Error(`the template has no single ${ROOT}`);
  }
  return template
    .replace(PREVIEW_META, "")
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      "</head>",
      `    <meta name="robots" content="noindex" />\n  </head>`
    )
    .replace(ROOT, () => `<div id="root" data-page="notFound">${body}</div>`);
}

/** sitemap.xml: every page the table lists for it, by its canonical
 *  address. */
export function sitemapXml(
  pages: readonly SitePage[],
  canonicalUrl: (page: SitePage) => string
): string {
  const urls = pages
    .filter((page) => page.inSitemap)
    .map((page) => `  <url><loc>${escapeHtml(canonicalUrl(page))}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/** robots.txt: every address may be read, and where the sitemap is. A
 *  shared post stays readable: a link's preview is fetched by crawlers
 *  that obey this file. */
export function robotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}
