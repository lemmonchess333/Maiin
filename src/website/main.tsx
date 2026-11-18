/**
 * troposfit.com's entry (App1 Q52): the website, built by
 * `npm run build:hosting` in place of the app (`website.html`, which
 * scripts/website/websiteEntry.ts writes out as the Hosting build's
 * index.html, and which scripts/website/prerender.ts fills with each
 * page). No sign-in, no Firebase SDK and no service worker of its own; the
 * GitHub Pages build is still the whole app.
 *
 * Every page arrives written. This script decides whether it needs more:
 * a page written for this address is left as it is, with only the home
 * page's photographs set fading, and loads no framework. React is
 * fetched only to draw what no file holds: an invite's code, a Space's
 * line, a shared post, or "not found" (`boot.tsx`).
 */
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/archivo/wght.css";
import "@/index.css";
import "@/website/website.css";
import { normalisePath } from "@/website/site/pages";
import { startPhotoFade } from "@/website/site/photoFade";
import { applyWebsiteHead, landingHead } from "@/website/websiteHead";
import {
  inviteFromSearch,
  isAppAddress,
  landingContext,
} from "@/website/websiteAddress";

/**
 * Whether the written page is the page for this address as it stands. It
 * is when Hosting served the address's own file; the home page's file for
 * an address the app answered, with nothing to add (firebase.json's last
 * rewrite); the Pro page's at `/upgrade`, the app's Pro address, unless
 * the checkout is returning; and the missing page's. Anything else, React
 * draws: an invite's code, a Space's line, the checkout's return, a shared
 * post.
 */
function writtenFits(written: string | undefined): boolean {
  if (written === undefined) return false;
  const path = normalisePath(location.pathname);
  const { invite, note } = landingContext(path, location.search);
  if (written === "/404") return true;
  if (written === "/pro" && path === "/upgrade") return note === null;
  if (written !== "/") return written === path;
  if (inviteFromSearch(location.search) !== null || invite) return false;
  if (path === "/") return true;
  return isAppAddress(path) && !path.startsWith("/activity/") && note === null;
}

const root = document.getElementById("root")!;
if (writtenFits(root.dataset.page)) {
  // The home page's file at an address of the app's: the front page is
  // the copy to index (`websiteHead.ts`).
  if (root.dataset.page === "/") {
    applyWebsiteHead(landingHead(location.pathname, location.search));
  }
  const photos = root.querySelector<HTMLElement>(".site-hero-photos");
  if (photos) startPhotoFade(photos);
} else {
  void import("@/website/boot").then(({ boot }) => boot(root));
}
