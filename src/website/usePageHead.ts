import { useEffect } from "react";
import { canonicalUrl, type SitePage } from "@/website/sitePages";

/** The head element named `selector`, made when the page has none. */
function headElement<T extends HTMLElement>(
  selector: string,
  make: () => T
): T {
  const found = document.head.querySelector<T>(selector);
  if (found) return found;
  const made = make();
  document.head.appendChild(made);
  return made;
}

/**
 * The tab's title, the description and the canonical address of the page
 * on screen, kept as the visitor moves between pages without a reload.
 * The page's first HTML already carries them (`scripts/website/
 * prerender.ts`); this is for the moves after it. A page with no entry
 * in the table (a shared post, the 404) passes its own title and nothing
 * else, and the canonical address is taken away; the 404 asks search
 * engines not to keep it (`noindex`).
 */
export function usePageHead(
  page: SitePage | { title: string; noindex?: boolean }
): void {
  const title = page.title;
  const noindex = "noindex" in page && page.noindex === true;
  const description = "description" in page ? page.description : null;
  const canonical = "path" in page ? canonicalUrl(page) : null;
  useEffect(() => {
    document.title = title;
    if (description !== null) {
      headElement('meta[name="description"]', () => {
        const meta = document.createElement("meta");
        meta.name = "description";
        return meta;
      }).content = description;
    }
    const link = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    );
    if (canonical === null) {
      link?.remove();
    } else {
      headElement('link[rel="canonical"]', () => {
        const made = document.createElement("link");
        made.rel = "canonical";
        return made;
      }).href = canonical;
    }
    const robots = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]'
    );
    if (!noindex) {
      robots?.remove();
    } else {
      headElement('meta[name="robots"]', () => {
        const meta = document.createElement("meta");
        meta.name = "robots";
        return meta;
      }).content = "noindex";
    }
  }, [title, description, canonical, noindex]);
}
