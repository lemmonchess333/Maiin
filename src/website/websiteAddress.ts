/**
 * What troposfit.com shows at an address (App1 Q50 and Q52, owner
 * 15 November 2026): the website points to the App Store and no longer
 * serves the app, and every address already handed out keeps answering.
 *
 * Firebase Hosting answers most addresses with the website's one page
 * (firebase.json's last rewrite); this decides what that page draws. A
 * shared post (`/activity/<id>`) reaches the page through
 * `publicPostPage`, which adds the post's figures to it
 * (functions/lib/publicPost.js), and draws the post's card. The legal and
 * support pages are the app's own. Everything else is the page that
 * points to the App Store, with a line for the address that brought the
 * visitor where one helps:
 *
 * - `?invite=<code>`: a friend's invite (Soc15). The iPhone app opens the
 *   link itself when it is installed; without it the page shows the code
 *   to copy, since installing does not carry it across.
 * - `/space/<id>`, and a post in one (`/space/<id>/post/<id>`): a shared
 *   Space (Run27 call 11), which the iPhone app opens when it is installed.
 * - `/upgrade?checkout=success`: where RevenueCat's hosted checkout returns
 *   after a web purchase (docs/iap/revenuecat-setup.md, Part W). That
 *   address opens the website's Pro page (`PAGE_ALIASES` in
 *   `sitePages.ts`), which adds this line. The website does not sell while
 *   the web engine is open (Q77), and the parameter is unsigned, so anyone
 *   can type it: the line says what is true if they just paid, and nothing
 *   here claims a payment.
 */
import { normaliseInviteCode } from "@/lib/inviteCode";
import { INVITE_PARAM } from "@/lib/publicLinks";

/** The line the App Store page adds for the address that brought someone. */
export type LandingNote = "space" | "checkoutDone" | null;

export interface LandingContext {
  /** A friend's invite code from the address, as the server reads it. */
  invite: string | null;
  note: LandingNote;
}

/** The invite code in a query string, or null. Only one, as the iPhone
 *  app takes it (`nativeInviteLinks.ts`): two codes name no one friend. */
export function inviteFromSearch(search: string): string | null {
  const codes = new URLSearchParams(search).getAll(INVITE_PARAM);
  return codes.length === 1 ? normaliseInviteCode(codes[0]) : null;
}

/** What the App Store page says at `pathname` with `search`. */
export function landingContext(
  pathname: string,
  search: string
): LandingContext {
  const invite = inviteFromSearch(search);
  const path = pathname.replace(/\/+$/, "");
  let note: LandingNote = null;
  if (/^\/space\/[^/]+(\/post\/[^/]+)?$/.test(path)) note = "space";
  else if (
    path === "/upgrade" &&
    new URLSearchParams(search).get("checkout") === "success"
  )
    note = "checkoutDone";
  return { invite, note };
}
