import { Suspense, useEffect, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { lazyRetry } from "@/lib/lazyRetry";
import Landing from "@/website/Landing";

/* Each page but the App Store page is fetched when its address is opened,
   so the page most visitors see carries none of them. */
const PublicPost = lazyRetry(() => import("@/pages/PublicPost"));
const PrivacyPolicy = lazyRetry(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazyRetry(() => import("@/pages/TermsOfService"));
const Support = lazyRetry(() => import("@/pages/Support"));

/** The page's name in the browser's tab. */
const WEBSITE_TITLES = {
  landing: "Tropos: your training and food, planned together",
  post: "Tropos",
  privacy: "Privacy Policy · Tropos",
  terms: "Terms of Service · Tropos",
  support: "Support · Tropos",
} as const;

function Titled({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return children;
}

/**
 * troposfit.com's addresses (App1 Q52): a shared post's public page (Q51),
 * the legal and support pages the App Store listing links to, and the App
 * Store page for everything else. The same pages the app has signed out,
 * less the app. firebase.json sends every address here but a shared
 * post, which reaches it through `publicPostPage`, and Hosting's own
 * `/__/` handlers.
 */
export default function WebsiteRoutes() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Routes>
        <Route
          path="/activity/:activityId"
          element={
            <Titled title={WEBSITE_TITLES.post}>
              <PublicPost />
            </Titled>
          }
        />
        <Route
          path="/privacy"
          element={
            <Titled title={WEBSITE_TITLES.privacy}>
              <PrivacyPolicy />
            </Titled>
          }
        />
        <Route
          path="/terms"
          element={
            <Titled title={WEBSITE_TITLES.terms}>
              <TermsOfService />
            </Titled>
          }
        />
        <Route
          path="/support"
          element={
            <Titled title={WEBSITE_TITLES.support}>
              <Support />
            </Titled>
          }
        />
        <Route
          path="*"
          element={
            <Titled title={WEBSITE_TITLES.landing}>
              <Landing />
            </Titled>
          }
        />
      </Routes>
    </Suspense>
  );
}
