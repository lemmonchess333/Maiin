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
 * line, the checkout's return or a shared post (`boot.tsx`).
 */
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/archivo/wght.css";
import "@/index.css";
import "@/website/website.css";
import { startPhotoFade } from "@/website/site/photoFade";
import { applyWebsiteHead, landingHead } from "@/website/websiteHead";
import { isPostAddress, writtenFits } from "@/website/websiteAddress";

const root = document.getElementById("root")!;
if (writtenFits(root.dataset.page, location.pathname, location.search)) {
  // The home page's file at an address of the app's: the front page is
  // the copy to index (`websiteHead.ts`).
  if (root.dataset.page === "/") {
    applyWebsiteHead(landingHead(location.pathname, location.search));
  }
  const photos = root.querySelector<HTMLElement>(".site-hero-photos");
  if (photos) startPhotoFade(photos);
} else {
  // React draws the written page again with its line added (an invite, a
  // Space, the checkout's return), so it stays until React replaces it;
  // a shared post is another page, so the home page's goes at once.
  if (isPostAddress(location.pathname)) root.replaceChildren();
  root.removeAttribute("data-page");
  void import("@/website/boot").then(({ boot }) => boot(root));
}
