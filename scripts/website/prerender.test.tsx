/**
 * Each of troposfit.com's pages, drawn as the build draws it
 * (`src/website/prerender.tsx`, run by scripts/website/prerender.ts):
 * every page comes out whole, with its own headline, Apple's badge once,
 * and words in the house voice.
 */
import { describe, expect, it } from "vitest";
import { renderPage } from "@/website/prerender";
import { SITE_PAGES } from "@/website/sitePages";
import { APP_STORE_URL } from "@/lib/publicLinks";

/** The words a person reads: the markup's text, tags and attributes out. */
function textOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADINGS: Record<string, string> = {
  home: "Your training and food, planned together",
  lifting: "Strength sessions built around your week",
  running: "From your first 5K to a marathon",
  food: "Eat for the plan you’re on",
  social: "Train with the people you know",
  pro: "What Pro adds",
  about: "One plan for lifting, running and food",
  press: "Writing about Tropos",
  support: "Support",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
};

describe("each page drawn at build time", () => {
  it.each(SITE_PAGES)("$path", async (page) => {
    const html = await renderPage(page.path);
    // The page itself, not the routes' blank fallback.
    const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
    expect(h1).toHaveLength(1);
    expect(textOf(h1[0][1])).toBe(HEADINGS[page.key]);
    // The header, the footer and Apple's credit for its badge.
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain("App Store is a service mark of Apple Inc.");
    // Every website page leads to the App Store, with Apple's badge once
    // (its rules: one badge per layout). The app's legal pages carry none.
    const badges = html.match(/alt="Download on the App Store"/g) ?? [];
    const legal = ["support", "privacy", "terms"].includes(page.key);
    expect(badges).toHaveLength(legal ? 0 : 1);
    expect(html).toContain(`href="${APP_STORE_URL}"`);
  });

  it.each(
    SITE_PAGES.filter((p) => !["privacy", "terms", "support"].includes(p.key))
  )("$path speaks in the house voice", async (page) => {
    const text = textOf(await renderPage(page.path));
    // No exclamation marks in everyday text, no em dash rhythm, the
    // app's apostrophe (CODING_STANDARDS, house voice).
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/[A-Za-z]'[A-Za-z]/);
    // None of the words the house voice rules out.
    expect(text).not.toMatch(/\b(unlock|elevate|seamless|journey)\b/i);
  });
});
