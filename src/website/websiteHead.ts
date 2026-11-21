/**
 * What troposfit.com's App Store page tells a search engine about the
 * address it was opened at. Every address the website does not otherwise
 * answer draws that one page (`websiteAddress.ts`), so each names the
 * front page as the canonical copy, and the addresses the app's account
 * pages used (`/upgrade`, `/settings/…`) ask not to be indexed at all.
 */
import { useEffect } from "react";
import { PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";

export interface WebsiteHead {
  /** The canonical address, or null at the front page itself. */
  canonical: string | null;
  /** Whether the address asks search engines not to index it. */
  noindex: boolean;
}

/** The head the App Store page carries at `pathname` with `search`. */
export function landingHead(pathname: string, search: string): WebsiteHead {
  const atFront = pathname === "/" && (search === "" || search === "?");
  return {
    canonical: atFront ? null : `${PUBLIC_APP_ORIGIN}/`,
    noindex: /^\/(upgrade|settings)(\/|$)/.test(pathname),
  };
}

/** The tags this page adds to the document's head are marked, so they go
 *  when it does. */
const MARK = "data-website-head";

/** Puts `head`'s canonical link and robots tag in the document's head
 *  while the page is shown. */
export function useWebsiteHead(head: WebsiteHead): void {
  const { canonical, noindex } = head;
  useEffect(() => {
    const added: HTMLElement[] = [];
    if (canonical) {
      const link = document.createElement("link");
      link.rel = "canonical";
      link.href = canonical;
      link.setAttribute(MARK, "");
      added.push(link);
    }
    if (noindex) {
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
  }, [canonical, noindex]);
}
