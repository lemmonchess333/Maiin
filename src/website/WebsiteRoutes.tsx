import { Suspense, useEffect, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { lazyRetry } from "@/lib/lazyRetry";
import HomePage from "@/website/pages/Home";
import {
  SITE_ORIGIN,
  SITE_PAGES,
  normalisePath,
  sitePage,
} from "@/website/site/pages";
import { useWebsiteHead } from "@/website/useWebsiteHead";
import { isAppAddress, landingContext } from "@/website/websiteAddress";
import { landingHead } from "@/website/websiteHead";

/* Every page but the home page is fetched when React has to draw it. The
   build writes each page as a file of its own (scripts/website/
   prerender.ts) and Hosting serves that file, so React draws a page only
   for an address no file answers: an invite, a Space, a shared post, an
   address that is not here. */
const PublicPost = lazyRetry(() => import("@/pages/PublicPost"));
const PrivacyPolicy = lazyRetry(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazyRetry(() => import("@/pages/TermsOfService"));
const Support = lazyRetry(() => import("@/pages/Support"));
const LegalPage = lazyRetry(() => import("@/website/pages/LegalPage"));
const LiftingPage = lazyRetry(() => import("@/website/pages/Lifting"));
const RunningPage = lazyRetry(() => import("@/website/pages/Running"));
const FoodPage = lazyRetry(() => import("@/website/pages/Food"));
const SocialPage = lazyRetry(() => import("@/website/pages/Social"));
const ProPage = lazyRetry(() => import("@/website/pages/Pro"));
const AboutPage = lazyRetry(() => import("@/website/pages/About"));
const PressPage = lazyRetry(() => import("@/website/pages/Press"));
const NotFoundPage = lazyRetry(() => import("@/website/pages/NotFound"));

/** A shared post's tab name: the post's own title is in its preview tags. */
const POST_TITLE = "Tropos";

function title(path: string): string {
  return sitePage(path)?.title ?? SITE_PAGES[0].title;
}

function Titled({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return children;
}

/** The home page, with the line for the address that brought someone,
 *  naming the front page as its canonical copy (`websiteHead.ts`). */
function Home() {
  const { pathname, search } = useLocation();
  useWebsiteHead(landingHead(pathname, search));
  return (
    <Titled title={title("/")}>
      <HomePage context={landingContext(pathname, search)} />
    </Titled>
  );
}

/** The Pro page at `/upgrade`, the app's Pro address, with the line for
 *  the checkout's return (#3375). */
function Upgrade() {
  const { pathname, search } = useLocation();
  // The Pro page is the copy to index; the app's paywall address is not.
  useWebsiteHead({ canonical: `${SITE_ORIGIN}/pro`, noindex: true });
  return (
    <Titled title={title("/pro")}>
      <ProPage
        checkoutDone={landingContext(pathname, search).note === "checkoutDone"}
      />
    </Titled>
  );
}

/** An address no page has: one the app answered goes home (App1 Q52),
 *  anything else is not here, and says so to a search engine too. */
function Elsewhere() {
  const { pathname } = useLocation();
  const notFound = !isAppAddress(normalisePath(pathname));
  useEffect(() => {
    if (!notFound) return;
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    return () => robots.remove();
  }, [notFound]);
  if (!notFound) return <Home />;
  return (
    <Titled title={title("/404")}>
      <NotFoundPage />
    </Titled>
  );
}

const PAGES: readonly [string, ReactNode][] = [
  ["/lifting", <LiftingPage />],
  ["/running", <RunningPage />],
  ["/food", <FoodPage />],
  ["/social", <SocialPage />],
  ["/pro", <ProPage />],
  ["/about", <AboutPage />],
  ["/press", <PressPage />],
  ["/support", <LegalPage path="/support" page={Support} />],
  ["/privacy", <LegalPage path="/privacy" page={PrivacyPolicy} />],
  ["/terms", <LegalPage path="/terms" page={TermsOfService} />],
];

/**
 * troposfit.com's addresses as React draws them (App1 Q50 and Q52): the
 * website's pages, a shared post's public page (Q51), the Pro page at
 * `/upgrade` with the checkout's return, and the home page, with its line,
 * for an invite, a Space and every other address the app answered.
 * `main.tsx` brings React in only when the page Hosting wrote is not
 * already the page for the address.
 */
export default function WebsiteRoutes() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upgrade" element={<Upgrade />} />
        {PAGES.map(([path, element]) => (
          <Route
            key={path}
            path={path}
            element={<Titled title={title(path)}>{element}</Titled>}
          />
        ))}
        <Route
          path="/activity/:activityId"
          element={
            <Titled title={POST_TITLE}>
              <PublicPost />
            </Titled>
          }
        />
        <Route path="*" element={<Elsewhere />} />
      </Routes>
    </Suspense>
  );
}
