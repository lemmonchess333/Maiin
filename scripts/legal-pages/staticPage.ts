/**
 * The public, signed-out copies of the Privacy Policy and the Terms
 * (`public/legal/privacy.html`, `public/legal/terms.html`) are built from
 * the in-app pages, never written by hand. Apple's reviewer and anyone on
 * the open web read the static copies (`docs/public-legal-pages.md`), so a
 * copy that lags its page tells them something the app no longer does:
 * the hand-kept privacy copy was still the May 2026 version in October,
 * promising deletion "within 30 days" long after the app stopped saying so.
 *
 * `sync-legal-pages.ts` writes the copies with these helpers, and
 * `legal-pages.test.ts` fails when a copy's words or links differ from a
 * fresh render of its page. The markup handled here is React's own render
 * of two simple pages, so plain string matching is enough; a page that
 * stops having an <h1>, a "Last updated" line and <section>s fails loudly.
 */
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

/** In-app routes and where the same page lives among the static copies. */
const STATIC_HREF: Record<string, string> = {
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/support": "support.html",
};

/**
 * The page's content as the static copy carries it: the title, the
 * "Last updated" line and every section, with the app's classes and its
 * Back button removed and in-app links pointed at the static copies.
 */
export function renderStaticBody(Page: ComponentType): string {
  const markup = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(Page))
  )
    .replace(/<button\b[\s\S]*?<\/button>/g, "")
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/href="([^"]*)"/g, (whole, href: string) =>
      STATIC_HREF[href] ? `href="${STATIC_HREF[href]}"` : whole
    )
    // React escapes quotes in text as well as in attributes; text needs
    // neither, and the copies are meant to be readable as source.
    .replace(
      />([^<]*)</g,
      (_, text: string) =>
        `>${text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'")}<`
    );

  const title = markup.match(/<h1>[\s\S]*?<\/h1>/);
  const updated = markup.match(/<p>(Last updated[\s\S]*?)<\/p>/);
  const sections = markup.match(/<section>[\s\S]*?<\/section>/g);
  if (!title || !updated || !sections) {
    throw new Error(
      "legal page: expected an <h1>, a 'Last updated' line and <section>s"
    );
  }

  return [
    title[0],
    `<p class="updated">${updated[1]}</p>`,
    `<div class="card">`,
    ...sections,
    `</div>`,
  ].join("\n");
}

const BODY_START = '<div class="brand">Tropos</div>';
const BODY_END = "<footer>";

/** The static page with its content replaced and its shell (head, styles,
 *  brand line and footer) kept. */
export function rebuildPage(shell: string, body: string): string {
  const start = shell.indexOf(BODY_START);
  const end = shell.indexOf(BODY_END);
  if (start < 0 || end < start) {
    throw new Error("legal page: the static shell has lost its markers");
  }
  return (
    shell.slice(0, start + BODY_START.length) +
    "\n" +
    body +
    "\n" +
    shell.slice(end)
  );
}

/**
 * What a reader sees and where its links go, between the brand line and
 * the footer, for comparing a static copy with its page. `words` drops
 * whitespace altogether: React renders block elements with nothing between
 * them and Prettier lays the copy out with line breaks, so only the
 * characters themselves can be compared.
 */
export function readable(html: string): { words: string; links: string[] } {
  const start = html.indexOf(BODY_START);
  const end = html.indexOf(BODY_END);
  const content =
    start >= 0 && end > start
      ? html.slice(start + BODY_START.length, end)
      : html;
  return {
    words: content.replace(/<[^>]*>/g, "").replace(/\s+/g, ""),
    links: [...content.matchAll(/href="([^"]*)"/g)].map((m) => m[1]),
  };
}
