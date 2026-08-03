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
 * Re-cut 2026-08-03 from PR #1456, whose branch had drifted 1,045 files
 * from main and could never merge; the component itself was unchanged.
 */
export function PaywallLegalLinks() {
  return (
    <p className="text-caption text-muted-foreground text-center">
      <Link to="/terms" className="underline underline-offset-2">
        Terms
      </Link>
      <span aria-hidden="true"> · </span>
      <Link to="/privacy" className="underline underline-offset-2">
        Privacy
      </Link>
    </p>
  );
}
