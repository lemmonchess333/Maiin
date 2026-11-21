import { CircleCheck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import AuthLockup from "@/components/auth/AuthLockup";
import WelcomePhotos from "@/components/auth/WelcomePhotos";
import AppStoreBadge, { APPLE_CREDIT } from "@/website/AppStoreBadge";
import WebsiteInvite from "@/website/WebsiteInvite";
import { landingContext } from "@/website/websiteAddress";
import { landingHead, useWebsiteHead } from "@/website/websiteHead";

/**
 * troposfit.com's page (App1 Q50 and Q52): what Tropos is, and the App
 * Store badge. The website does not offer the app in the browser; the
 * browser app stays on the GitHub Pages preview.
 *
 * It is the welcome without its way in (DESIGN_GUIDE §14p): the
 * photographs, the lockup at the top, the welcome's own words at the foot
 * on their dark ground, then the badge where Get started stands in the
 * app. Every address the website does not otherwise answer lands here,
 * with a line for the one that brought the visitor (`websiteAddress.ts`),
 * and names the front page as its canonical copy (`websiteHead.ts`).
 *
 * A line over the photographs stands on an opaque card (`--stage-raised`),
 * so its words never meet a photograph's mid-tones.
 */
export default function Landing() {
  const { pathname, search } = useLocation();
  const { invite, note } = landingContext(pathname, search);
  useWebsiteHead(landingHead(pathname, search));

  return (
    <div className="ds-auth-shell welcome-shell">
      <WelcomePhotos />
      <main className="ds-auth-page welcome-page">
        <AuthLockup className="text-stage-foreground" />
        <div className="welcome-copy">
          {note === "checkoutDone" && (
            <div
              role="status"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-stage-raised border border-success/30 text-sm font-medium text-stage-foreground"
            >
              <CircleCheck
                className="size-4 shrink-0 mt-0.5 text-success-strong"
                aria-hidden="true"
              />
              <span>
                If you just paid, Pro is on for your account in the Tropos app.
              </span>
            </div>
          )}
          <div>
            {note === "space" && (
              <p className="mb-1.5 text-sm font-semibold text-stage-foreground">
                Get Tropos on your iPhone to open this Space.
              </p>
            )}
            <h1 className="text-h2 font-extrabold leading-[1.12] tracking-tight text-stage-foreground text-balance">
              Your training and food, planned together
            </h1>
            <p className="mt-1.5 text-sm text-stage-foreground/80">
              Answer a few questions and get a week of training and a daily
              calorie target that fit you. Tropos is an iPhone app.
            </p>
          </div>
          {invite && <WebsiteInvite code={invite} />}
          <AppStoreBadge />
          <nav
            aria-label="Legal and support"
            className="flex flex-wrap items-center gap-x-3 text-xs text-stage-muted"
          >
            <FooterLink to="/privacy">Privacy Policy</FooterLink>
            <span aria-hidden="true">·</span>
            <FooterLink to="/terms">Terms of Service</FooterLink>
            <span aria-hidden="true">·</span>
            <FooterLink to="/support">Support</FooterLink>
          </nav>
          <p className="text-xs text-stage-muted">{APPLE_CREDIT}</p>
        </div>
      </main>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center min-h-[44px] px-1 hover:text-stage-foreground transition-colors"
    >
      {children}
    </Link>
  );
}
