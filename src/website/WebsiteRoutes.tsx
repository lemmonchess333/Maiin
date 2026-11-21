import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { lazyRetry } from "@/lib/lazyRetry";
import SiteLayout from "@/website/chrome/SiteLayout";
import Home from "@/website/pages/Home";
import NotFound from "@/website/pages/NotFound";
import { WEBSITE_PAGE_MODULES } from "@/website/pageModules";
import { sitePage, websiteRoute } from "@/website/sitePages";
import { sitePageHead, usePageHead } from "@/website/usePageHead";

/* Home and the 404 are in the first script; each other page is fetched
   when its address is opened, so Home, the page most visitors see,
   carries none of them. */
const Lifting = lazyRetry(WEBSITE_PAGE_MODULES.lifting);
const Running = lazyRetry(WEBSITE_PAGE_MODULES.running);
const Food = lazyRetry(WEBSITE_PAGE_MODULES.food);
const Social = lazyRetry(WEBSITE_PAGE_MODULES.social);
const Pro = lazyRetry(WEBSITE_PAGE_MODULES.pro);
const About = lazyRetry(WEBSITE_PAGE_MODULES.about);
const Press = lazyRetry(WEBSITE_PAGE_MODULES.press);
const PrivacyPolicy = lazyRetry(WEBSITE_PAGE_MODULES.privacy);
const TermsOfService = lazyRetry(WEBSITE_PAGE_MODULES.terms);
const Support = lazyRetry(WEBSITE_PAGE_MODULES.support);
const PublicPost = lazyRetry(WEBSITE_PAGE_MODULES.post);

/** A shared post's page names the post, not the website. */
const POST_TITLE = "Tropos";

/** The app's legal and support pages, as the app draws them, inside the
 *  website's header and footer. */
function Legal({
  page,
  children,
}: {
  page: "privacy" | "terms" | "support";
  children: ReactNode;
}) {
  usePageHead(sitePageHead(sitePage(page)));
  return <SiteLayout ownMain>{children}</SiteLayout>;
}

function Post() {
  usePageHead({ title: POST_TITLE });
  return <PublicPost />;
}

/** Any other address: one of the app's own lands on Home, which points to
 *  the App Store (App1 Q52); anything else is the 404. */
function Elsewhere() {
  const { pathname } = useLocation();
  return websiteRoute(pathname).kind === "appAddress" ? <Home /> : <NotFound />;
}

/** A new page opens at its top, as a page loaded afresh does. The page
 *  the browser loaded keeps the place it restored. */
function ScrollToTop() {
  const { pathname } = useLocation();
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname === first.current) return;
    first.current = "";
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * troposfit.com's addresses (App1 Q52 and the website’s design): the
 * website's pages, a shared post's public page (Q51), the app's legal and
 * support pages, Home for every address of the app's own, and the 404.
 * firebase.json sends every address here but a shared post, which
 * reaches it through `publicPostPage`, and Hosting's own `/__/` handlers;
 * each page in `SITE_PAGES` also has its own HTML, written at build time
 * (scripts/website/prerender.ts), which this takes over.
 */
export default function WebsiteRoutes() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lifting" element={<Lifting />} />
          <Route path="/running" element={<Running />} />
          <Route path="/food" element={<Food />} />
          <Route path="/social" element={<Social />} />
          <Route path="/pro" element={<Pro />} />
          <Route path="/about" element={<About />} />
          <Route path="/press" element={<Press />} />
          <Route path="/activity/:activityId" element={<Post />} />
          <Route
            path="/privacy"
            element={
              <Legal page="privacy">
                <PrivacyPolicy />
              </Legal>
            }
          />
          <Route
            path="/terms"
            element={
              <Legal page="terms">
                <TermsOfService />
              </Legal>
            }
          />
          <Route
            path="/support"
            element={
              <Legal page="support">
                <Support />
              </Legal>
            }
          />
          <Route path="*" element={<Elsewhere />} />
        </Routes>
      </Suspense>
    </>
  );
}
