/**
 * What troposfit.com's home page tells a search engine about an address
 * it is drawn at other than its own. The home page's file also answers
 * every address the app answered (firebase.json's rewrite) and an
 * invite's or a Space's link, so at each of those it names the front
 * page as the canonical copy, and the addresses the app's account pages
 * used (`/upgrade`, `/settings/…`) ask not to be indexed at all. The
 * website's own pages carry their own head, written at build time
 * (scripts/website/sitePage.ts).
 *
 * No React here: `main.tsx` applies it to a written page without loading
 * any (`applyWebsiteHead`); `useWebsiteHead.ts` is the hook for a page
 * React draws.
 */
import { PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";

export interface WebsiteHead {
  /** The canonical address, or null at the front page itself. */
  canonical: string | null;
  /** Whether the address asks search engines not to index it. */
  noindex: boolean;
}

/** The head the home page carries at `pathname` with `search`. */
export function landingHead(pathname: string, search: string): WebsiteHead {
  const atFront = pathname === "/" && (search === "" || search === "?");
  return {
    canonical: atFront ? null : `${PUBLIC_APP_ORIGIN}/`,
    noindex: /^\/(upgrade|settings)(\/|$)/.test(pathname),
  };
}

/** The tags this adds to the document's head are marked, so they go when
 *  it does. */
const MARK = "data-website-head";

/** Puts `head`'s canonical link and robots tag in the document's head,
 *  and returns what takes them out. */
export function applyWebsiteHead(head: WebsiteHead): () => void {
  const added: HTMLElement[] = [];
  if (head.canonical) {
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = head.canonical;
    link.setAttribute(MARK, "");
    added.push(link);
  }
  if (head.noindex) {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    meta.setAttribute(MARK, "");
    added.push(meta);
  }
  for (const el of added) document.head.appendChild(el);
  return () => {
    for (const el of added) el.remove();
  };
}
