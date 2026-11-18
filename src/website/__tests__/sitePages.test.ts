/**
 * troposfit.com's page table (`sitePages.ts`): each page's head is fit to
 * be read, its preview picture exists, and every address the app's routes
 * handed out lands on Home rather than the 404.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_ADDRESS_PREFIXES,
  SITE_PAGES,
  prerenderedKeyFor,
  websiteRoute,
} from "@/website/sitePages";

const root = process.cwd();

describe("SITE_PAGES", () => {
  it("gives each page its own address, title and description", () => {
    const paths = SITE_PAGES.map((p) => p.path);
    const titles = SITE_PAGES.map((p) => p.title);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(titles).size).toBe(titles.length);
    for (const page of SITE_PAGES) {
      expect(page.path).toMatch(/^\/([a-z-]+)?$/);
      // A search result shows about 160 characters of a description.
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(page.description.length).toBeGreaterThan(50);
      expect(page.title.length).toBeLessThanOrEqual(60);
    }
  });

  it("has every preview picture it names", () => {
    for (const page of SITE_PAGES) {
      expect(page.image).toMatch(/^\/og\/[a-z]+\.jpg$/);
      const file = join(root, "src/website", page.image);
      expect(existsSync(file), file).toBe(true);
    }
  });
});

describe("websiteRoute", () => {
  it("answers each page at its address, with or without a trailing slash", () => {
    for (const page of SITE_PAGES) {
      expect(websiteRoute(page.path)).toEqual({ kind: "page", key: page.key });
      expect(websiteRoute(`${page.path}/`)).toEqual({
        kind: "page",
        key: page.key,
      });
    }
  });

  it("sends a shared post to its page and anything unknown to the 404", () => {
    expect(websiteRoute("/activity/run1")).toEqual({ kind: "post" });
    expect(websiteRoute("/blog")).toEqual({ kind: "notFound" });
    expect(websiteRoute("/liftingx")).toEqual({ kind: "notFound" });
    expect(prerenderedKeyFor("/blog")).toBeNull();
    expect(prerenderedKeyFor("/activity/run1")).toBeNull();
  });

  it("lands every route of the app's on Home, whose HTML Hosting sends for it", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    const routes = [...app.matchAll(/path="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((path) => path !== "*");
    expect(routes.length).toBeGreaterThan(20);
    for (const route of routes) {
      const address = route.replace(/:[A-Za-z]+/g, "x");
      const answer = websiteRoute(address);
      expect(answer.kind, `${route} is one of the app's addresses`).not.toBe(
        "notFound"
      );
      if (answer.kind === "appAddress") {
        expect(prerenderedKeyFor(address)).toBe("home");
      }
    }
    // Each prefix is one the app has, so the list does not keep an
    // address the app never had.
    for (const prefix of APP_ADDRESS_PREFIXES.filter(
      (p) => p !== "/onboarding"
    )) {
      expect(
        routes.some((r) => r === prefix || r.startsWith(`${prefix}/`)),
        prefix
      ).toBe(true);
    }
  });
});
