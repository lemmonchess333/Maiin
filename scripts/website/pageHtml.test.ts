/**
 * The HTML each page is written into at build time (`pageHtml.ts`): its
 * head is its own, its body is the page drawn, and Home keeps no
 * canonical address, because Home's HTML is also the page a shared post
 * and every other address arrive on.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { APP_STORE_URL, PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";
import { canonicalUrl, sitePage, SITE_PAGES } from "@/website/sitePages";
import {
  APP_STORE_ID,
  SITE_ORIGIN,
  fillNotFound,
  fillPage,
  robotsTxt,
  sitemapXml,
} from "./pageHtml";

const TEMPLATE = `<!doctype html>
<html lang="en-GB">
  <head>
    <meta name="description" content="The shell's line." />
    <meta property="og:title" content="Tropos" />
    <meta name="twitter:card" content="summary" />
    <title>Tropos</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("fillPage", () => {
  it("writes a page's own head and its drawing", () => {
    const page = sitePage("lifting");
    const html = fillPage(
      TEMPLATE,
      page,
      "<main>drawn</main>",
      canonicalUrl(page)
    );
    expect(html).toContain("<title>Lifting · Tropos</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://troposfit.com/lifting" />'
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://troposfit.com/og/lifting.jpg" />'
    );
    expect(html).toContain(
      '<div id="root" data-page="lifting"><main>drawn</main></div>'
    );
    // The shell's own lines are gone, not doubled.
    expect(html).not.toContain("The shell's line.");
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
  });

  it("gives every page but Home Safari's Smart App Banner, once", () => {
    for (const page of SITE_PAGES.filter((p) => p.path !== "/")) {
      const html = fillPage(TEMPLATE, page, "", canonicalUrl(page));
      expect(html.split('name="apple-itunes-app"'), page.path).toHaveLength(2);
      expect(html).toContain(
        `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}" />`
      );
    }
    expect(APP_STORE_URL).toBe(`https://apps.apple.com/app/id${APP_STORE_ID}`);
  });

  it("gives Home no canonical address and no banner, which a shared post's page adds itself", () => {
    const page = sitePage("home");
    const html = fillPage(TEMPLATE, page, "", canonicalUrl(page));
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain("apple-itunes-app");
    expect(html).toContain(
      'property="og:url" content="https://troposfit.com/"'
    );
  });

  it("escapes what it writes into an attribute, and keeps a $ in the page", () => {
    const page = { ...sitePage("pro"), title: 'Pro "for" <you>' };
    const html = fillPage(
      TEMPLATE,
      page,
      "<p>$1 &amp; $&</p>",
      canonicalUrl(page)
    );
    expect(html).toContain("<title>Pro &quot;for&quot; &lt;you&gt;</title>");
    expect(html).toContain("<p>$1 &amp; $&</p>");
  });

  it("replaces website.html's own head, not adds to it", () => {
    // The real page, as Vite writes it out as index.html: its tags must be
    // the shape PREVIEW_META removes, or every page ships two of each.
    const real = readFileSync(`${process.cwd()}/website.html`, "utf8");
    const page = sitePage("running");
    const html = fillPage(real, page, "<main>drawn</main>", canonicalUrl(page));
    for (const tag of [
      'name="description"',
      'property="og:title"',
      'property="og:image"',
      'name="twitter:card"',
    ]) {
      expect(html.split(tag), tag).toHaveLength(2);
    }
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain("<title>Running · Tropos</title>");
  });

  it("refuses a template without one empty #root", () => {
    expect(() =>
      fillPage("<html></html>", sitePage("home"), "", PUBLIC_APP_ORIGIN)
    ).toThrow(/#root|root/);
  });
});

describe("fillNotFound", () => {
  it("writes the 404 with no preview, no canonical, and noindex", () => {
    const html = fillNotFound(
      TEMPLATE,
      "Page not found · Tropos",
      "<h1>x</h1>"
    );
    expect(html).toContain("<title>Page not found · Tropos</title>");
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toMatch(
      /og:|twitter:|name="description"|canonical|apple-itunes-app/
    );
    expect(html).toContain(
      '<div id="root" data-page="notFound"><h1>x</h1></div>'
    );
  });
});

describe("the sitemap and robots.txt", () => {
  it("names the site's own origin", () => {
    expect(SITE_ORIGIN).toBe(PUBLIC_APP_ORIGIN);
  });

  it("lists every page the table puts in it, once", () => {
    const xml = sitemapXml(SITE_PAGES, canonicalUrl);
    for (const page of SITE_PAGES.filter((p) => p.inSitemap)) {
      expect(xml.split(`<loc>${canonicalUrl(page)}</loc>`)).toHaveLength(2);
    }
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  });

  it("lets every address be read and names the sitemap", () => {
    expect(robotsTxt()).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://troposfit.com/sitemap.xml\n"
    );
  });
});
