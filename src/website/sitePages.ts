/**
 * troposfit.com's pages, from the website’s design: each page's address,
 * its title and description, the picture a pasted link shows, and whether
 * it is in the sitemap. One table, read by the routes, by the build step
 * that writes each page out as its own HTML (`scripts/website/prerender.ts`)
 * and by the sitemap, so a page cannot be in one and missing from another.
 *
 * Addresses have no trailing slash: firebase.json's `trailingSlash: false`
 * serves `/lifting` from `lifting/index.html` and sends `/lifting/` there.
 */
import { PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";

export type SitePageKey =
  | "home"
  | "lifting"
  | "running"
  | "food"
  | "social"
  | "pro"
  | "about"
  | "press"
  | "support"
  | "privacy"
  | "terms";

export interface SitePage {
  key: SitePageKey;
  /** The address, from the root, without a trailing slash ("/" for Home). */
  path: string;
  /** The browser tab's title. */
  title: string;
  /** The search result's and a pasted link's line, 160 characters or fewer. */
  description: string;
  /** A pasted link's picture, 1200 x 630, under `/og/`. */
  image: string;
  /** Listed in sitemap.xml. */
  inSitemap: boolean;
}

export const SITE_PAGES: readonly SitePage[] = [
  {
    key: "home",
    path: "/",
    title: "Tropos: your training and food, planned together",
    description:
      "Tropos plans your lifting and running week and works out a daily calorie target to match. An iPhone app, free on the App Store.",
    image: "/og/home.jpg",
    inSitemap: true,
  },
  {
    key: "lifting",
    path: "/lifting",
    title: "Lifting · Tropos",
    description:
      "A lifting plan for 2 to 6 days a week. Each session starts from what you lifted last time, with a drawn form guide for every exercise.",
    image: "/og/lifting.jpg",
    inSitemap: true,
  },
  {
    key: "running",
    path: "/running",
    title: "Running · Tropos",
    description:
      "GPS runs with pace, splits and a route map, and race plans for 5K to marathon built back from race day around your lifting.",
    image: "/og/running.jpg",
    inSitemap: true,
  },
  {
    key: "food",
    path: "/food",
    title: "Food · Tropos",
    description:
      "A daily calorie target from your numbers, with protein, carbs and fat. Log a meal by typing it, searching or scanning a barcode.",
    image: "/og/food.jpg",
    inSitemap: true,
  },
  {
    key: "social",
    path: "/social",
    title: "Social · Tropos",
    description:
      "Share sessions with the people who follow you. Circles for small groups, Spaces for races, and a weekly league scored against your own plan.",
    image: "/og/social.jpg",
    inSitemap: true,
  },
  {
    key: "pro",
    path: "/pro",
    title: "Tropos Pro",
    description:
      "Pro adds photo food logging, a calorie target that adapts to you and paces that move with your runs. Your training plan stays free.",
    image: "/og/pro.jpg",
    inSitemap: true,
  },
  {
    key: "about",
    path: "/about",
    title: "About · Tropos",
    description:
      "Tropos plans lifting, running and food in one place, so the three agree. What it is, who makes it and how it treats your data.",
    image: "/og/home.jpg",
    inSitemap: true,
  },
  {
    key: "press",
    path: "/press",
    title: "Press kit · Tropos",
    description:
      "Tropos’s press kit: the facts, a paragraph to quote, the logo, the app icon and app screens to download.",
    image: "/og/home.jpg",
    inSitemap: true,
  },
  {
    key: "support",
    path: "/support",
    title: "Support · Tropos",
    description:
      "Get help with Tropos: how to reach support, what to send with a problem and what to do when you can’t sign in.",
    image: "/og/home.jpg",
    inSitemap: true,
  },
  {
    key: "privacy",
    path: "/privacy",
    title: "Privacy Policy · Tropos",
    description:
      "How Tropos collects, uses and protects your data, and the choices you have.",
    image: "/og/home.jpg",
    inSitemap: true,
  },
  {
    key: "terms",
    path: "/terms",
    title: "Terms of Service · Tropos",
    description:
      "The terms for using Tropos and Tropos Pro: your account, subscriptions, what you post and what each side is responsible for.",
    image: "/og/home.jpg",
    inSitemap: true,
  },
];

/** The page with this key. */
export function sitePage(key: SitePageKey): SitePage {
  const page = SITE_PAGES.find((p) => p.key === key);
  if (!page) throw new Error(`No site page ${key}`);
  return page;
}

/** A page's full address, as a search engine and a pasted link name it. */
export function canonicalUrl(page: SitePage): string {
  return page.path === "/"
    ? `${PUBLIC_APP_ORIGIN}/`
    : PUBLIC_APP_ORIGIN + page.path;
}

/** The title a page that is not in the table shows: the 404's. */
export const NOT_FOUND_TITLE = "Page not found · Tropos";

/**
 * The app's own addresses, from its routes (src/App.tsx), which shared
 * links, widgets and the old web app on this domain handed out. The
 * website answers each with Home, which points to the App Store, rather
 * than the 404 (`websiteRoute`). `appRoutesKept.test.ts` holds this list
 * to App.tsx, so a route added to the app is kept here too.
 */
export const APP_ADDRESS_PREFIXES: readonly string[] = [
  "/admin",
  "/circuit",
  "/diagnostics",
  "/dev",
  "/empty-workout",
  "/followers",
  "/following",
  "/history",
  "/league",
  "/onboarding",
  "/program",
  "/review",
  "/routine",
  "/run",
  "/run-summary",
  "/segment",
  "/settings",
  "/space",
  "/upgrade",
  "/user",
  "/workout",
];

/** What the website shows at an address: a page in the table, a shared
 *  post or card, Home for one of the app's addresses, or the 404. */
export type WebsiteRoute =
  | { kind: "page"; key: SitePageKey }
  | { kind: "post" }
  | { kind: "card" }
  | { kind: "appAddress" }
  | { kind: "notFound" };

/**
 * The address without the file's name a page is also reached by:
 * Hosting serves `/lifting/index.html` and `/index.html` as the files they
 * name, which are Lifting's and Home's pages, so the browser writes
 * `/lifting` and `/` in their place (`main.tsx`) and takes the page over
 * rather than draw the 404 on it.
 */
export function withoutIndexFile(pathname: string): string {
  const stripped = pathname.replace(/\/index\.html$/, "");
  return stripped === "" ? "/" : stripped;
}

/** The address without its trailing slashes ("/" stays "/"). */
export function normalisePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function websiteRoute(pathname: string): WebsiteRoute {
  const path = normalisePath(pathname);
  const page = SITE_PAGES.find((p) => p.path === path);
  if (page) return { kind: "page", key: page.key };
  if (/^\/activity\/[^/]+$/.test(path)) return { kind: "post" };
  if (/^\/card\/[^/]+$/.test(path)) return { kind: "card" };
  const app = APP_ADDRESS_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
  return app ? { kind: "appAddress" } : { kind: "notFound" };
}

/**
 * Whether the browser takes over the HTML it was sent for `pathname`
 * (`hydrateRoot`) or draws the page afresh: only when the HTML was written
 * for the page this address draws (`written`, its `#root` `data-page`).
 * Home's HTML arrives for a shared post too (publicPostPage fills it), and
 * the 404's for any unknown address.
 */
export function takesOverHtml(
  pathname: string,
  written: string | undefined
): boolean {
  if (!written) return false;
  const route = websiteRoute(pathname);
  const drawn =
    route.kind === "notFound" ? "notFound" : prerenderedKeyFor(pathname);
  return written === drawn;
}

/**
 * Which pre-written page an address draws, so the browser can take over
 * the HTML it was sent (`main.tsx`) rather than draw it again. One of the
 * app's addresses draws Home, the page Hosting sends for it. A shared post
 * or card arrives as Home's HTML with its data, and is drawn afresh.
 */
export function prerenderedKeyFor(pathname: string): SitePageKey | null {
  const route = websiteRoute(pathname);
  if (route.kind === "page") return route.key;
  if (route.kind === "appAddress") return "home";
  return null;
}
