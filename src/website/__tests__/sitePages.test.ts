/**
 * troposfit.com's pages as the build writes them (`renderSitePage`, the
 * same function scripts/website/prerender.ts runs): one headline each,
 * Apple's badge at most once (Apple: "one App Store badge per layout")
 * and every page ending at the App Store, links that Hosting answers,
 * pictures that exist, and the figures read from the app's own code.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FREE_KEEPS, PRO_INCLUDES } from "@/components/paywall/proIncludesCopy";
import { DAILY_AI_LIMITS } from "@/lib/aiLimits";
import { getInlinePriceSummary, PRO_PLANS, TRIAL_DAYS } from "@/lib/proPlans";
import { APP_STORE_URL } from "@/lib/publicLinks";
import { renderSitePage } from "@/website/prerender";
import { SITE_ART_FILES } from "@/website/site/art";
import { SITE_PAGES, sitePageFile } from "@/website/site/pages";
import { websitePublicFiles } from "../../../scripts/website/websiteEntry";
import {
  resolveHosting,
  type HostingConfig,
} from "../../../scripts/website/hostingResolve";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const hosting = (
  JSON.parse(readFileSync(join(repoRoot, "firebase.json"), "utf8")) as {
    hosting: HostingConfig;
  }
).hosting;

function walk(dir: string, rel: string, out: Set<string>) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const path = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) walk(full, path, out);
    else out.add(path);
  }
}

/** What the Hosting build deploys: the pages, the website's part of
 *  `public/` and the drawings it copies, and the kit's and previews' files
 *  (src/website/static, under /press-kit/ and /og/). */
const files = new Set<string>([
  ...SITE_PAGES.map(sitePageFile),
  ...websitePublicFiles(join(repoRoot, "public")),
  ...SITE_ART_FILES.map((file) => file.slice(1)),
]);
walk(join(repoRoot, "src/website/static/og"), "og", files);
walk(join(repoRoot, "src/website/static/press"), "press-kit", files);

function draw(path: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderSitePage(path);
  return root;
}

const BADGE =
  'a[href="' + APP_STORE_URL + '"] img[alt="Download on the App Store"]';

describe.each(SITE_PAGES.map((page) => [page.path, page] as const))(
  "the page at %s",
  (path, page) => {
    const root = draw(path);
    const text = root.textContent ?? "";

    it("has one headline", () => {
      expect(root.querySelectorAll("h1")).toHaveLength(1);
    });

    it("ends at the App Store, with Apple's badge once at most", () => {
      expect(root.querySelectorAll(BADGE).length).toBeLessThanOrEqual(1);
      if (page.kind !== "legal") {
        expect(root.querySelectorAll(BADGE)).toHaveLength(1);
      }
      expect(
        root.querySelectorAll(`a[href="${APP_STORE_URL}"]`).length
      ).toBeGreaterThanOrEqual(1);
    });

    it("links only to addresses Hosting answers", () => {
      for (const link of root.querySelectorAll<HTMLAnchorElement>(
        "a[href^='/']"
      )) {
        const href = link.getAttribute("href")!;
        const pathname = new URL(href, "https://troposfit.com").pathname;
        const answer = resolveHosting(hosting, files, pathname);
        expect(answer.kind, `${href} on ${path}`).not.toBe("404");
        expect(answer.kind, `${href} on ${path}`).not.toBe("redirect");
      }
    });

    it("draws only pictures that exist, each with alt text", () => {
      for (const img of root.querySelectorAll("img")) {
        expect(img.hasAttribute("alt"), img.outerHTML).toBe(true);
        const src = img.getAttribute("src") ?? img.getAttribute("data-src");
        // A bundled picture's address is Vite's (/assets/ built, /src/ here).
        if (src?.startsWith("/") && !/^\/(assets|src)\//.test(src)) {
          expect(files.has(src.slice(1)), src).toBe(true);
        }
      }
    });

    it("has a short title, a description and a preview picture", () => {
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(page.title.length).toBeLessThanOrEqual(60);
      expect(existsSync(join(repoRoot, "src/website/static", page.og))).toBe(
        true
      );
    });

    it("keeps the house voice: no exclamation marks, curly apostrophes", () => {
      if (page.kind === "legal") return; // the app's own pages, as they are
      expect(text).not.toMatch(/!/);
      expect(text).not.toMatch(/[A-Za-z]'[A-Za-z]/);
      expect(text).not.toMatch(/—/);
    });
  }
);

describe("figures the pages read from the app", () => {
  it("lists what Pro includes and what Free keeps, in the app's words", () => {
    const text = draw("/pro").textContent ?? "";
    for (const line of PRO_INCLUDES) expect(text).toContain(line);
    expect(text).toContain(FREE_KEEPS);
    expect(text).toContain(getInlinePriceSummary(PRO_PLANS));
    expect(text).toContain(`${TRIAL_DAYS} days free`);
  });

  it("names only drawings that exist in public/", () => {
    for (const file of SITE_ART_FILES) {
      expect(existsSync(join(repoRoot, "public", file)), file).toBe(true);
    }
  });

  it("names the photo cap the server holds", () => {
    expect(draw("/food").textContent).toContain(
      `up to ${DAILY_AI_LIMITS.pro.image_ai} a day`
    );
  });

  it("says on the Food page who reads a photo and where it is kept (Food9)", () => {
    expect(draw("/food").textContent).toContain(
      "Photos are read by Google and kept only on your phone."
    );
  });

  it("gives the press kit's price from the app's plans", () => {
    expect(draw("/press").textContent).toContain(
      getInlinePriceSummary(PRO_PLANS)
    );
  });
});

describe("the home page as the build writes it", () => {
  const root = draw("/");

  it("fetches only the first photograph with the page", () => {
    const photos = root.querySelectorAll("img[data-photo]");
    expect(photos.length).toBe(5);
    expect(photos[0].getAttribute("src")).toBeTruthy();
    for (const photo of [...photos].slice(1)) {
      expect(photo.getAttribute("src")).toBeNull();
      expect(photo.getAttribute("data-src")).toBeTruthy();
    }
  });

  it("carries the badge in its opening, under the headline", () => {
    const hero = root.querySelector(".site-hero")!;
    expect(hero.querySelector("h1")).not.toBeNull();
    expect(hero.querySelectorAll(BADGE)).toHaveLength(1);
  });
});
