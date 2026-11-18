/**
 * What troposfit.com shows at an address (App1 Q50 and Q52, owner
 * 15 November 2026): the website points to the App Store and no longer
 * serves the app, and every address already handed out keeps answering.
 *
 * Firebase Hosting answers each of the website's pages with a file of its
 * own (scripts/website/prerender.ts), every address the app answered with
 * the home page's file (firebase.json's rewrites), and anything else with
 * the missing page. This decides what those files leave to React
 * (`writtenFits`) and what the home page says for the address that
 * brought someone. A shared post (`/activity/<id>`) reaches the home
 * page's file through `publicPostPage`, which adds the post's figures to
 * it (functions/lib/publicPost.js), and React draws the post's card. The
 * legal and support pages are the app's own. The lines the home page adds:
 *
 * - `?invite=<code>`: a friend's invite (Soc15). The iPhone app opens the
 *   link itself when it is installed; without it the page shows the code
 *   to copy, since installing does not carry it across.
 * - `/space/<id>`, and a post in one (`/space/<id>/post/<id>`): a shared
 *   Space (Run27 call 11), which the iPhone app opens when it is installed.
 * - `/upgrade?checkout=success`: where RevenueCat's hosted checkout returns
 *   after a web purchase (docs/iap/revenuecat-setup.md, Part W), on the
 *   Pro page. The website does not sell while the web engine is open
 *   (Q77), and the parameter is unsigned, so anyone can type it: the line
 *   says what is true if they just paid, and nothing here claims a
 *   payment.
 */
import { normaliseInviteCode } from "@/lib/inviteCode";
import { INVITE_PARAM } from "@/lib/publicLinks";
import { normalisePath } from "@/website/site/pages";

/**
 * The first part of every address the app has answered (every `path=` in
 * src/App.tsx, pinned by websiteAddresses.test.tsx). Such an address was
 * handed out or bookmarked while troposfit.com served the app, or comes
 * from a widget's tap opened in a browser, so it lands on the home page
 * (the App Store page, App1 Q52) and never on "not found". The website's
 * own pages at `/food` and `/social` answer theirs first.
 */
export const APP_ADDRESS_ROOTS: ReadonlySet<string> = new Set([
  "activity",
  "admin",
  "dev",
  "diagnostics",
  "empty-workout",
  "followers",
  "following",
  "food",
  "history",
  "league",
  "onboarding",
  "privacy",
  "program",
  "review",
  "routine",
  "run",
  "run-summary",
  "segment",
  "settings",
  "social",
  "space",
  "support",
  "terms",
  "upgrade",
  "user",
  "workout",
]);

/** Whether `pathname` is one the app answered (`APP_ADDRESS_ROOTS`). */
export function isAppAddress(pathname: string): boolean {
  const first = pathname.replace(/^\/+/, "").split("/")[0];
  return first === "" || APP_ADDRESS_ROOTS.has(first);
}

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

/**
 * Whether the page Hosting wrote (`written`, the root's `data-page`) is
 * the page for `pathname` and `search` as it stands, so no framework is
 * fetched (`main.tsx`). It is when Hosting served the address's own file;
 * the home page's file at an address the app answered, with nothing to
 * add; the Pro page's at `/upgrade`, the app's Pro address, unless the
 * checkout is returning; and the missing page's. Anything else React
 * draws: an invite's code, a Space's line, the checkout's return, a
 * shared post.
 */
export function writtenFits(
  written: string | undefined,
  pathname: string,
  search: string
): boolean {
  if (written === undefined) return false;
  const path = normalisePath(pathname);
  const { invite, note } = landingContext(path, search);
  if (written === "/404") return true;
  if (written === "/pro" && path === "/upgrade") return note === null;
  if (written !== "/") return written === path;
  if (invite !== null) return false;
  if (path === "/") return true;
  return isAppAddress(path) && !isPostAddress(path) && note === null;
}

/** Whether `pathname` is a shared post's (`publicPostPage`'s). Hosting
 *  answers it with the home page's file, which React replaces with the
 *  post's card, so the home page must not show while that loads. */
export function isPostAddress(pathname: string): boolean {
  return /^\/activity\/[^/]+$/.test(normalisePath(pathname));
}
