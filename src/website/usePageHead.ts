import { useEffect } from "react";
import { canonicalUrl, type SitePage } from "@/website/sitePages";

/** What a page puts in the document's head while it is on screen. */
export interface PageHead {
  title: string;
  /** The search result's line; left as it is when absent. */
  description?: string;
  /** The page's canonical address, or none. */
  canonical?: string | null;
  /** Asks search engines not to keep the page. */
  noindex?: boolean;
}

/** A page of the table's head: its title, description and address. */
export function sitePageHead(page: SitePage): PageHead {
  return {
    title: page.title,
    description: page.description,
    canonical: canonicalUrl(page),
  };
}

/** The tags a page adds to the head are marked, so they go when it does. */
const MARK = "data-website-head";

/**
 * The tab's title, the description, the canonical address and the robots
 * tag of the page on screen, kept as the visitor moves between pages
 * without a reload. The page's first HTML already carries them
 * (`scripts/website/prerender.ts`); this is for the moves after it. A
 * canonical link or robots tag already in the head belongs to the page
 * the HTML was written for, so it is replaced, and what a page adds goes
 * with it.
 */
export function usePageHead(head: PageHead): void {
  const { title, description, canonical = null, noindex = false } = head;
  useEffect(() => {
    document.title = title;
    if (description !== undefined) {
      let meta = document.head.querySelector<HTMLMetaElement>(
        'meta[name="description"]'
      );
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }
      meta.content = description;
    }
    for (const el of document.head.querySelectorAll(
      'link[rel="canonical"], meta[name="robots"]'
    )) {
      el.remove();
    }
    const added: HTMLElement[] = [];
    if (canonical) {
      const link = document.createElement("link");
      link.rel = "canonical";
      link.href = canonical;
      added.push(link);
    }
    if (noindex) {
      const meta = document.createElement("meta");
      meta.name = "robots";
      meta.content = "noindex";
      added.push(meta);
    }
    for (const el of added) {
      el.setAttribute(MARK, "");
      document.head.appendChild(el);
    }
    return () => {
      for (const el of added) el.remove();
    };
  }, [title, description, canonical, noindex]);
}
