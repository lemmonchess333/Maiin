import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";
import { haptic } from "@/lib/haptic";
import { track } from "@/lib/paywallAnalytics";
import { personalTargetWords } from "@/lib/personalTargetWords";
import { useAuth } from "@/lib/auth";
import { isCheckoutTrialEligible } from "@/lib/subscription";
import { DEFAULT_PLAN } from "@/lib/proPlans";
import {
  offersTrial,
  useStoreTrialEligibility,
} from "@/hooks/useStoreTrialEligibility";
import { useSnoozeDismiss } from "@/hooks/useSnoozeDismiss";

/** "Not now" hides the card for this long, per account on this device. */
const PERSONAL_TARGET_SNOOZE_DAYS = 30;
const PERSONAL_TARGET_SNOOZE_KEY = "tropos-personal-target-snooze";

/**
 * Food tells a free account its personal target (whole-app grill Q49, Q87)
 * and offers the 7-day trial at that moment (Q71): the target needs about
 * two weeks of meals and weigh-ins, so a trial taken at setup could never
 * show it working, and one taken here starts on it the same day.
 *
 * It sits where the warmup bar was, under the wheel, today only. The number
 * is the person's to keep: the card says it whether or not they take Pro,
 * which applies it and keeps it moving. "Not now" hides it for a month.
 */
export default function PersonalTargetCard({
  personalTarget,
  currentTarget,
  trialOffered,
  onDismiss,
}: {
  personalTarget: number;
  /** The target the account follows now (the formula, for a free account). */
  currentTarget: number;
  /** The account still has its one trial, and the store agrees. */
  trialOffered: boolean;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const words = personalTargetWords(
    personalTarget,
    currentTarget,
    trialOffered
  );
  return (
    <Card
      as="section"
      aria-labelledby="personal-target-heading"
      className="mt-3"
    >
      <div className="flex items-start gap-2">
        <h3
          id="personal-target-heading"
          className="flex-1 text-sm font-semibold text-foreground text-pretty"
        >
          Your personal target is ready
        </h3>
        <IconButton
          aria-label="Not now"
          onClick={function () {
            haptic("light");
            onDismiss();
          }}
          className="-mr-2 -mt-2"
          icon={<X className="size-4" aria-hidden="true" />}
        />
      </div>
      <p className="mt-1 text-sm text-foreground text-pretty">{words.line}</p>
      <p className="mt-1 text-xs text-muted-foreground text-pretty">
        {words.pro}
      </p>
      <Button
        fullWidth
        className="mt-3"
        onClick={function () {
          haptic();
          track("paywall_cta_clicked", {
            source: "personal_target",
            featureKey: "adaptive_tdee",
          });
          navigate("/upgrade?from=personal_target");
        }}
      >
        {trialOffered ? "Try Pro free" : "See Pro"}
      </Button>
    </Card>
  );
}

/**
 * The card with what it needs from the account: whether the trial is still
 * on offer (the account's own record and the App Store's answer, as Home's
 * Pro strip asks) and the month-long "Not now". Draws nothing while snoozed.
 */
export function PersonalTargetOffer({
  personalTarget,
  currentTarget,
}: {
  personalTarget: number;
  currentTarget: number;
}) {
  const { user, profile } = useAuth();
  const store = useStoreTrialEligibility();
  const { snoozed, snooze } = useSnoozeDismiss(
    `${PERSONAL_TARGET_SNOOZE_KEY}:${user?.uid ?? "anon"}`,
    PERSONAL_TARGET_SNOOZE_DAYS
  );
  if (snoozed) return null;
  return (
    <PersonalTargetCard
      personalTarget={personalTarget}
      currentTarget={currentTarget}
      trialOffered={offersTrial(
        isCheckoutTrialEligible(profile),
        store,
        DEFAULT_PLAN
      )}
      onDismiss={snooze}
    />
  );
}
