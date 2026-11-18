/**
 * What troposfit.com's App Store page tells a search engine about the
 * address it was opened at. Every address the website does not otherwise
 * answer draws that one page (`websiteAddress.ts`), so each names the
 * front page as the canonical copy, and the addresses the app's account
 * pages used (`/upgrade`, `/settings/…`) ask not to be indexed at all.
 * Home puts it in the head (`usePageHead`).
 */
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
