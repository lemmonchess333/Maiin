import { useNavigate } from "react-router-dom";
import { Crown, ChevronRight } from "lucide-react";
import { useSubscription } from "@/lib/subscription";
import { useAuth } from "@/lib/auth";
import { runningTrial, trialEndDayText } from "@/lib/subscriptionTrial";
import { haptic } from "@/lib/haptic";

/**
 * The plan and its status, on Account, opening the Pro page.
 *
 * It was the one button on Settings → Subscription, a page whose two rows
 * both opened the Pro page for a free account. Trim1 call 7 (the owner, 11
 * November 2026: "streamline all") put it on Account; the Settings list's
 * Account row carries the plan as its value, as the Subscription row did.
 */
export default function SubscriptionCard() {
  const navigate = useNavigate();
  const { isInTrial, trialDaysLeft, tier } = useSubscription();
  const { profile } = useAuth();
  // A store trial in progress (Sub1, STATUS 2026-10-06): say when it ends.
  const storeTrial =
    tier === "pro"
      ? runningTrial(profile?.subscriptionTrial, new Date())
      : null;
  const trialEnds = storeTrial ? trialEndDayText(storeTrial) : null;

  const statusLabel =
    tier === "pro"
      ? trialEnds
        ? storeTrial?.willRenew
          ? `Free until ${trialEnds}`
          : `Pro until ${trialEnds}`
        : "All Pro features"
      : isInTrial
        ? `Pro trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left`
        : "See what Pro adds";

  return (
    <button
      type="button"
      onClick={() => {
        haptic();
        navigate("/upgrade?from=settings");
      }}
      className="w-full flex items-center justify-between p-4 rounded-2xl bg-card transition-transform motion-safe:active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <Crown className="size-5 text-primary" />
        <div className="text-left">
          <p className="text-sm font-medium text-foreground">
            {tier === "pro"
              ? trialEnds
                ? "Pro trial"
                : "Pro"
              : isInTrial
                ? "Pro trial"
                : "Upgrade to Pro"}
          </p>
          <p className="text-xs text-muted-foreground">{statusLabel}</p>
        </div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}
