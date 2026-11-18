/**
 * troposfit.com's pages: each one's address, its name in the browser's
 * tab, the line a search result or a pasted link shows, and its preview
 * picture. One list, read by the build (scripts/website/prerender.ts,
 * which writes each page as a file of its own with these tags in its
 * head, the sitemap and robots.txt), by the page in the browser
 * (`main.tsx`, which leaves a written page alone) and by the tests.
 *
 * No React here: `main.tsx` reads it before deciding whether to load any.
 */
import { PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";

export type SitePageKind =
  /** A page of the website's own (Home, a sport, Pro, About, the press kit). */
  | "site"
  /** The app's own signed-out page, inside the website's header and footer. */
  | "legal"
  /** The page for an address the website does not have. */
  | "notFound";

export interface SitePage {
  /** The address, without a trailing slash ("/" for the home page). */
  path: string;
  kind: SitePageKind;
  /** The tab's name: two to four words, then " · Tropos" (Home's is its
   *  promise). */
  title: string;
  /** The search result's and the pasted link's line. Under 160 characters. */
  description: string;
  /** The preview picture, under /og/ (src/website/static/og). */
  og: string;
}

export const SITE_ORIGIN = PUBLIC_APP_ORIGIN;

/** The promise, as the welcome says it (DESIGN_GUIDE §14p). */
export const SITE_PROMISE = "Your training and food, planned together";

export const SITE_PAGES: readonly SitePage[] = [
  {
    path: "/",
    kind: "site",
    title: `Tropos: ${SITE_PROMISE.charAt(0).toLowerCase()}${SITE_PROMISE.slice(1)}`,
    description:
      "Tropos plans your lifting and running week and sets a daily calorie target to fit it. An iPhone app, on the App Store.",
    og: "/og/home.png",
  },
  {
    path: "/lifting",
    kind: "site",
    title: "Lifting · Tropos",
    description:
      "A lifting plan of 2 to 6 sessions a week, split to suit your days. Each session starts from what you lifted last time.",
    og: "/og/lifting.png",
  },
  {
    path: "/running",
    kind: "site",
    title: "Running · Tropos",
    description:
      "GPS runs with pace, splits and a route map, and race plans from 5K to 100K built back from race day.",
    og: "/og/running.png",
  },
  {
    path: "/food",
    kind: "site",
    title: "Food · Tropos",
    description:
      "Log a meal the way you’d say it, search or scan a barcode, against a daily calorie target worked out from your numbers.",
    og: "/og/food.png",
  },
  {
    path: "/social",
    kind: "site",
    title: "Circles, Spaces and leagues · Tropos",
    description:
      "Share sessions with the people who follow you, plan meet-ups in a Circle of up to 8, and join a weekly league scored on your own plan.",
    og: "/og/social.png",
  },
  {
    path: "/pro",
    kind: "site",
    title: "Tropos Pro",
    description:
      "What Pro adds to Tropos, what stays free, and what it costs. Pro is a monthly or yearly subscription with a 7-day free trial.",
    og: "/og/pro.png",
  },
  {
    path: "/about",
    kind: "site",
    title: "About · Tropos",
    description:
      "Who makes Tropos, what it holds to, and whose maps, weather and food data it uses.",
    og: "/og/home.png",
  },
  {
    path: "/press",
    kind: "site",
    title: "Press kit · Tropos",
    description:
      "Tropos in a paragraph, the facts, the icon, the mark and screens of the app to download, and who to ask.",
    og: "/og/home.png",
  },
  {
    path: "/support",
    kind: "legal",
    title: "Support · Tropos",
    description:
      "Email support@troposfit.com about a problem with Tropos or your account. We usually reply within a couple of days.",
    og: "/og/home.png",
  },
  {
    path: "/privacy",
    kind: "legal",
    title: "Privacy Policy · Tropos",
    description:
      "What Tropos collects, why, who processes it and how long it is kept, service by service.",
    og: "/og/home.png",
  },
  {
    path: "/terms",
    kind: "legal",
    title: "Terms of Service · Tropos",
    description: "The terms for using Tropos and Tropos Pro.",
    og: "/og/home.png",
  },
  {
    path: "/404",
    kind: "notFound",
    title: "Page not found · Tropos",
    description: "This page isn’t on troposfit.com.",
    og: "/og/home.png",
  },
];

/** The page at `path`, or undefined. */
export function sitePage(path: string): SitePage | undefined {
  return SITE_PAGES.find((page) => page.path === path);
}

/** The file Firebase Hosting serves a page from: `index.html` for the home
 *  page, `404.html` for the missing page, and `<path>/index.html` for the
 *  rest, which firebase.json's `trailingSlash: false` serves at the
 *  address without its slash. */
export function sitePageFile(page: SitePage): string {
  if (page.path === "/") return "index.html";
  if (page.kind === "notFound") return "404.html";
  return `${page.path.slice(1)}/index.html`;
}

/** The pages a search engine is told about (sitemap.xml). */
export function indexedPages(): SitePage[] {
  return SITE_PAGES.filter((page) => page.kind !== "notFound");
}

/** An address without a trailing slash, or the `/index.html` of the file
 *  Hosting also serves it from (`/pro/index.html` is the Pro page). */
export function normalisePath(pathname: string): string {
  const trimmed = pathname.replace(/(\/index\.html)?\/*$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** The website's sections, in the header's order. */
export const SITE_NAV: readonly { href: string; label: string }[] = [
  { href: "/lifting", label: "Lifting" },
  { href: "/running", label: "Running" },
  { href: "/food", label: "Food" },
  { href: "/social", label: "Social" },
  { href: "/pro", label: "Pro" },
];
