import type { SitePageKey } from "@/website/sitePages";

/**
 * Where each of the website's later-loaded pages lives, for the routes
 * (`WebsiteRoutes`, each behind `lazyRetry`) and for the first script,
 * which fetches the page on screen before it takes over that page's HTML
 * (`main.tsx`), so the visitor never sees the routes' blank fallback.
 * Home and the 404 are in the first script and have no entry.
 */
export const WEBSITE_PAGE_MODULES = {
  lifting: () => import("@/website/pages/Lifting"),
  running: () => import("@/website/pages/Running"),
  food: () => import("@/website/pages/Food"),
  social: () => import("@/website/pages/Social"),
  pro: () => import("@/website/pages/Pro"),
  about: () => import("@/website/pages/About"),
  press: () => import("@/website/pages/Press"),
  privacy: () => import("@/pages/PrivacyPolicy"),
  terms: () => import("@/pages/TermsOfService"),
  support: () => import("@/pages/Support"),
  post: () => import("@/pages/PublicPost"),
} satisfies Record<
  Exclude<SitePageKey, "home"> | "post",
  () => Promise<unknown>
>;
