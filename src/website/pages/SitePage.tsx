import PrivacyPolicy from "@/pages/PrivacyPolicy";
import Support from "@/pages/Support";
import TermsOfService from "@/pages/TermsOfService";
import AboutPage from "@/website/pages/About";
import FoodPage from "@/website/pages/Food";
import HomePage from "@/website/pages/Home";
import LegalPage from "@/website/pages/LegalPage";
import LiftingPage from "@/website/pages/Lifting";
import NotFoundPage from "@/website/pages/NotFound";
import PressPage from "@/website/pages/Press";
import ProPage from "@/website/pages/Pro";
import RunningPage from "@/website/pages/Running";
import SocialPage from "@/website/pages/Social";

/**
 * The website's page at `path` (one of `SITE_PAGES`), as the build writes
 * it (`src/website/prerender.ts`). Every page is imported here directly,
 * not lazily, so the written HTML is the page and never a placeholder.
 */
export default function SitePage({ path }: { path: string }) {
  switch (path) {
    case "/":
      return <HomePage />;
    case "/lifting":
      return <LiftingPage />;
    case "/running":
      return <RunningPage />;
    case "/food":
      return <FoodPage />;
    case "/social":
      return <SocialPage />;
    case "/pro":
      return <ProPage />;
    case "/about":
      return <AboutPage />;
    case "/press":
      return <PressPage />;
    case "/support":
      return <LegalPage path="/support" page={Support} />;
    case "/privacy":
      return <LegalPage path="/privacy" page={PrivacyPolicy} />;
    case "/terms":
      return <LegalPage path="/terms" page={TermsOfService} />;
    case "/404":
      return <NotFoundPage />;
    default:
      throw new Error(`No page is drawn for ${path}`);
  }
}
