import { ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  HEALTH_CONSENT_DECLINED_COPY,
  HEALTH_CONSENT_DECLINED_SIGNED_OUT_COPY,
} from "@/lib/healthConsent";

type AccountWays = {
  /** Opens Account at Delete account. */
  onDeleteAccount: () => void;
  onSignOut: () => void;
  onLeaveSetup?: never;
};

type SignedOutWays = {
  /** Setup before there is an account (A6): back to the welcome, the
   *  answers given so far forgotten. */
  onLeaveSetup: () => void;
  onDeleteAccount?: never;
  onSignOut?: never;
};

/**
 * Every way on from "Not now" on the health-details agreement (Priv1 call
 * 1), in setup's step and in the gate an older account meets: back to the
 * agreement, deleting the account (the existing deletion flow, on
 * Account), or signing out. Before there is an account (A6), back to the
 * agreement or leaving setup. None of them is a dead end, and none hides
 * the way out behind another ask.
 */
export default function HealthConsentDeclineActions({
  onBack,
  ...ways
}: {
  /** Back to the agreement and its I agree. */
  onBack: () => void;
} & (AccountWays | SignedOutWays)) {
  const back = (
    <Button
      variant="secondary"
      size="lg"
      fullWidth
      leftIcon={<ArrowLeft className="size-4" />}
      onClick={onBack}
    >
      {HEALTH_CONSENT_DECLINED_COPY.back}
    </Button>
  );
  if (ways.onLeaveSetup) {
    return (
      <div className="space-y-3">
        {back}
        <Button variant="ghost" size="lg" fullWidth onClick={ways.onLeaveSetup}>
          {HEALTH_CONSENT_DECLINED_SIGNED_OUT_COPY.leave}
        </Button>
      </div>
    );
  }
  const { onDeleteAccount, onSignOut } = ways as AccountWays;
  return (
    <div className="space-y-3">
      {back}
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
