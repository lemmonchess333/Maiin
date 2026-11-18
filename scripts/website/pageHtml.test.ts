/**
 * The HTML each page is written into at build time (`pageHtml.ts`): its
 * head is its own, its body is the page drawn, and Home keeps no
 * canonical address, because Home's HTML is also the page a shared post
 * and every other address arrive on.
 */
import { describe, expect, it } from "vitest";
import { PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";
import { canonicalUrl, sitePage, SITE_PAGES } from "@/website/sitePages";
import { SITE_ORIGIN, fillPage, robotsTxt, sitemapXml } from "./pageHtml";

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

  it("gives Home no canonical address", () => {
    const page = sitePage("home");
    const html = fillPage(TEMPLATE, page, "", canonicalUrl(page));
    expect(html).not.toContain('rel="canonical"');
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

  it("refuses a template without one empty #root", () => {
    expect(() =>
      fillPage("<html></html>", sitePage("home"), "", PUBLIC_APP_ORIGIN)
    ).toThrow(/#root|root/);
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
