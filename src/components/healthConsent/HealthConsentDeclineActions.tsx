import { ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import { HEALTH_CONSENT_DECLINED_COPY } from "@/lib/healthConsent";

/**
 * Every way on from "Not now" on the health-details agreement (Priv1 call
 * 1), in setup's step and in the gate an older account meets: back to the
 * agreement, deleting the account (the existing deletion flow, on
 * Account), or signing out. None of them is a dead end, and none hides the
 * way out behind another ask.
 */
export default function HealthConsentDeclineActions({
  onBack,
  onDeleteAccount,
  onSignOut,
}: {
  /** Back to the agreement and its I agree. */
  onBack: () => void;
  /** Opens Account at Delete account. */
  onDeleteAccount: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        leftIcon={<ArrowLeft className="size-4" />}
        onClick={onBack}
      >
        {HEALTH_CONSENT_DECLINED_COPY.back}
      </Button>
      <Button
        variant="destructive-tinted"
        size="lg"
        fullWidth
        onClick={onDeleteAccount}
      >
        {HEALTH_CONSENT_DECLINED_COPY.deleteAccount}
      </Button>
      <Button variant="ghost" size="lg" fullWidth onClick={onSignOut}>
        {HEALTH_CONSENT_DECLINED_COPY.signOut}
      </Button>
    </div>
  );
}
