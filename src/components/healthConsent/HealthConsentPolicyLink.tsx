import { Link } from "react-router-dom";
import { HEALTH_CONSENT_COPY } from "@/lib/healthConsent";

/**
 * The Privacy Policy, from the health-details agreement (Priv1 call 1):
 * agreeing is informed only if the policy can be read first. Both route
 * sets that ask (setup's, and the agreement's own) serve /privacy, and its
 * Back returns to the question. The link's name is its visible words.
 */
export default function HealthConsentPolicyLink() {
  return (
    <Link
      to="/privacy"
      className="inline-flex items-center min-h-11 text-base font-medium text-foreground underline underline-offset-2 hover:text-lifting-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
    >
      {HEALTH_CONSENT_COPY.policy}
    </Link>
  );
}
