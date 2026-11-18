import { describe, expect, it } from "vitest";
import {
  HEAD_END,
  HEAD_START,
  ROOT_EMPTY,
  pageHead,
  robots,
  sitemap,
  writePage,
  type PageForHead,
} from "./sitePage";
import { globToRegExp, resolveHosting } from "./hostingResolve";

const ORIGIN = "https://troposfit.com";
const HOME: PageForHead = {
  path: "/",
  kind: "site",
  title: "Tropos: your training and food, planned together",
  description: "Home's line.",
  og: "/og/home.png",
};
const LIFTING: PageForHead = {
  path: "/lifting",
  kind: "site",
  title: "Lifting · Tropos",
  description: 'Lifting’s line, with "quotes" & <angles>.',
  og: "/og/lifting.png",
};
const MISSING: PageForHead = {
  path: "/404",
  kind: "notFound",
  title: "Page not found · Tropos",
  description: "Not here.",
  og: "/og/home.png",
};

describe("a page's head", () => {
  it("names a page's own address, preview and Smart App Banner", () => {
    const head = pageHead(LIFTING, ORIGIN, "6762416918");
    expect(head).toContain("<title>Lifting · Tropos</title>");
    expect(head).toContain(
      '<link rel="canonical" href="https://troposfit.com/lifting" />'
    );
    expect(head).toContain(
      '<meta property="og:image" content="https://troposfit.com/og/lifting.png" />'
    );
    expect(head).toContain('content="summary_large_image"');
    expect(head).toContain(
      '<meta name="apple-itunes-app" content="app-id=6762416918" />'
    );
    // Attributes are escaped, so a quote cannot end one.
    expect(head).toContain("&quot;quotes&quot; &amp; &lt;angles&gt;");
    expect(head).not.toContain("noindex");
  });

  it("gives the home page no canonical and no banner: its file answers posts too", () => {
    const head = pageHead(HOME, ORIGIN, "6762416918");
    expect(head).not.toContain("canonical");
    expect(head).not.toContain("apple-itunes-app");
    expect(head).toContain('content="https://troposfit.com/"');
  });

  it("asks search engines not to list the missing page", () => {
    const head = pageHead(MISSING, ORIGIN);
    expect(head).toContain('<meta name="robots" content="noindex" />');
    expect(head).not.toContain("canonical");
  });
});

describe("writing a page into the built template", () => {
  const template = `<html><head>${HEAD_START}<title>Old</title>${HEAD_END}<script src="/assets/website.js"></script></head><body>${ROOT_EMPTY}</body></html>`;

  it("replaces the head block and fills the root, marking the page", () => {
    const html = writePage(template, LIFTING, "<main>Lifting</main>", ORIGIN);
    expect(html).not.toContain("<title>Old</title>");
    expect(html).toContain("<title>Lifting · Tropos</title>");
    expect(html).toContain(
      '<div id="root" data-page="/lifting"><main>Lifting</main></div>'
    );
    // The built script and styles stay.
    expect(html).toContain('<script src="/assets/website.js"></script>');
  });

  it("refuses a template without its markers", () => {
    expect(() => writePage("<html></html>", LIFTING, "", ORIGIN)).toThrow(
      /site:head/
    );
    expect(() =>
      writePage(`${HEAD_START}${HEAD_END}`, LIFTING, "", ORIGIN)
    ).toThrow(/root/);
  });
});

describe("the sitemap and robots.txt", () => {
  it("lists each page once, the home page with its slash", () => {
    const xml = sitemap(ORIGIN, ["/", "/lifting"]);
    expect(xml).toContain("<loc>https://troposfit.com/</loc>");
    expect(xml).toContain("<loc>https://troposfit.com/lifting</loc>");
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it("points crawlers at the sitemap and keeps them off Hosting's own paths", () => {
    expect(robots(ORIGIN)).toBe(
      "User-agent: *\nDisallow: /__/\n\nSitemap: https://troposfit.com/sitemap.xml\n"
    );
  });
});

describe("Hosting's globs and slashes (checked against the Hosting emulator)", () => {
  it("reads extglob and braces, and /foo/** does not take /foo", () => {
    const rule = globToRegExp("/@(history|league){,/**}");
    expect(rule.test("/history")).toBe(true);
    expect(rule.test("/league/a/b")).toBe(true);
    expect(rule.test("/historyx")).toBe(false);
    expect(globToRegExp("/space/**").test("/space")).toBe(false);
    expect(globToRegExp("/space/**").test("/space/a")).toBe(true);
    expect(globToRegExp("/a.b").test("/aXb")).toBe(false);
  });

  it("serves a page without its slash and redirects the slash away", () => {
    const files = new Set(["index.html", "lifting/index.html"]);
    const off = { trailingSlash: false };
    expect(resolveHosting(off, files, "/lifting")).toEqual({
      kind: "file",
      file: "lifting/index.html",
    });
    expect(resolveHosting(off, files, "/lifting/")).toEqual({
      kind: "redirect",
      destination: "/lifting",
    });
    // Unset, Hosting adds the slash instead.
    expect(resolveHosting({}, files, "/lifting")).toEqual({
      kind: "redirect",
      destination: "/lifting/",
    });
    expect(resolveHosting(off, files, "/")).toEqual({
      kind: "file",
      file: "index.html",
    });
  });
});
