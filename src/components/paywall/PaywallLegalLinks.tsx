import { Link } from "react-router-dom";

/**
 * Terms + Privacy links for purchase surfaces (App Store Guideline
 * 3.1.2 — auto-renewable subscription screens must carry functional
 * links to the privacy policy and terms of use). Routes are the same
 * in-app legal pages SupportLegalSection links, so the copy can never
 * drift from what Settings shows.
 *
 * Rendered on both paywall surfaces (ProModal footer, Upgrade page
 * footer) — one component so a future EULA change lands in both.
 *
 * Each link carries its page's full name, the one its heading and
 * Settings → Support & legal use: a reviewer looks for the terms and the
 * privacy policy by name, and "Terms · Privacy" made them guess (launch
 * audit, 2026-11-18).
 *
 * Re-cut 2026-08-03 from PR #1456, whose branch had drifted 1,045 files
 * from main and could never merge; the component itself was unchanged.
 */
export function PaywallLegalLinks() {
  return (
    <p className="text-micro text-muted-foreground text-center">
      <Link to="/terms" className="underline underline-offset-2">
        Terms of Service
      </Link>
      <span aria-hidden="true"> · </span>
      <Link to="/privacy" className="underline underline-offset-2">
        Privacy Policy
      </Link>
    </p>
  );
}
