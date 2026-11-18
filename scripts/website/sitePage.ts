/**
 * How a page of troposfit.com is written into the Hosting build: the
 * page's own head (title, description, address, preview) in the place
 * `website.html` marks for it, and the page's markup in `#root`, which
 * `src/website/main.tsx` reads to know the page is already drawn. The
 * build (`prerender.ts`) and the tests share these, so what is tested is
 * what is written.
 */

export interface PageForHead {
  path: string;
  kind: "site" | "legal" | "notFound";
  title: string;
  description: string;
  og: string;
}

/** Where `website.html` holds the page's own head. */
export const HEAD_START = "<!--site:head-->";
export const HEAD_END = "<!--/site:head-->";
/** The empty root the page's markup replaces. */
export const ROOT_EMPTY = '<div id="root"></div>';

/** The preview picture's size (src/website/static/og). */
export const OG_SIZE = { width: 1200, height: 630 } as const;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The page's address on the site, without a trailing slash. */
export function pageUrl(origin: string, path: string): string {
  return path === "/" ? `${origin}/` : `${origin}${path}`;
}

/**
 * The page's own head. The home page names no canonical address: its file
 * is also the page every other address is answered with (firebase.json's
 * last rewrite, and `publicPostPage`, which adds a post's own preview
 * tags to it and removes these), so a canonical there would claim a
 * shared post's page for the home page. The missing page asks not to be
 * listed.
 *
 * Every page but the home page also carries Safari's Smart App Banner
 * (`apple-itunes-app`), Apple's own "Open" or "View" bar for an iPhone.
 * The home page's file is `publicPostPage`'s too, which adds its own
 * banner naming the post; two in one head would leave Safari to choose
 * (#3375).
 */
export function pageHead(
  page: PageForHead,
  origin: string,
  appStoreId?: string
): string {
  const url = pageUrl(origin, page.path);
  const image = `${origin}${page.og}`;
  const tags = [
    `<title>${escapeText(page.title)}</title>`,
    `<meta name="description" content="${escapeAttr(page.description)}" />`,
  ];
  if (page.kind === "notFound") {
    tags.push('<meta name="robots" content="noindex" />');
  } else if (page.path !== "/") {
    tags.push(`<link rel="canonical" href="${escapeAttr(url)}" />`);
  }
  if (appStoreId && page.path !== "/") {
    tags.push(
      `<meta name="apple-itunes-app" content="app-id=${escapeAttr(appStoreId)}" />`
    );
  }
  tags.push(
    '<meta property="og:site_name" content="Tropos" />',
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${escapeAttr(page.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(page.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    `<meta property="og:image:width" content="${OG_SIZE.width}" />`,
    `<meta property="og:image:height" content="${OG_SIZE.height}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttr(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(page.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`
  );
  return tags.join("\n    ");
}

/** `template` (the built website.html) with the page's head and markup. */
export function writePage(
  template: string,
  page: PageForHead,
  markup: string,
  origin: string,
  appStoreId?: string
): string {
  const start = template.indexOf(HEAD_START);
  const end = template.indexOf(HEAD_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("website.html has no <!--site:head--> block");
  }
  if (!template.includes(ROOT_EMPTY)) {
    throw new Error(`website.html has no ${ROOT_EMPTY}`);
  }
  const head = `${HEAD_START}\n    ${pageHead(page, origin, appStoreId)}\n    ${HEAD_END}`;
  const root = `<div id="root" data-page="${escapeAttr(page.path)}">${markup}</div>`;
  return (
    (template.slice(0, start) + head + template.slice(end + HEAD_END.length))
      // A function, so a "$&" or "$'" in a page's words stays as written.
      .replace(ROOT_EMPTY, () => root)
  );
}

/** sitemap.xml for the pages a search engine is told about. */
export function sitemap(origin: string, paths: readonly string[]): string {
  const urls = paths
    .map(
      (path) => `  <url><loc>${escapeText(pageUrl(origin, path))}</loc></url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** robots.txt: everything may be read but Hosting's own handlers. */
export function robots(origin: string): string {
  return `User-agent: *\nDisallow: /__/\n\nSitemap: ${origin}/sitemap.xml\n`;
}
