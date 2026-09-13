/**
 * SettingsSubscription — Subscription nested page (Set1.2).
 *
 * The plan row says what the account is actually on, in the terms the
 * user will recognise from the App Store sheet:
 *
 *   - a billed trial: "Free trial · ends 20 Sept, then £3.99/mo" — the
 *     subscription is live and converts unless cancelled, so the row
 *     MANAGES it (Apple's subscriptions page on iOS, the Stripe portal
 *     on web) and never sells one;
 *   - Pro: "Renews 20 Oct" when the expiry is on the profile, else
 *     "Full access" — manages likewise;
 *   - either of those with auto-renew OFF: "Ends 20 Sept · won't renew"
 *     and a Resubscribe action to the same store page — never "unless
 *     you cancel" to someone who has;
 *   - the legacy no-card free week: the countdown, to the offer page;
 *   - free: the offer page, tagged as a Settings entry.
 *
 * Price comes from the plan the profile's product id names; when that
 * is unknown (a dev override, a Stripe row before the product is
 * mirrored) the line ends at the date rather than guessing a price.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, ChevronRight } from "lucide-react";
import { useSubscription } from "@/lib/subscription";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { describePlanStatus } from "@/lib/subscriptionStatusCopy";
import { manageSubscription, planForProductId } from "@/lib/purchaseProvider";
import SettingsSection from "@/components/settings/SettingsSection";
import AiUsageSection from "@/components/settings/AiUsageSection";
import TrackSettingsSectionView from "@/components/settings/TrackSettingsSectionView";

export default function SettingsSubscription() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isInTrial, trialDaysLeft, tier, trialKind, trialEndsAt, autoRenew } =
    useSubscription();
  const [manageLoading, setManageLoading] = useState(false);

  // One line per state, shared with the offer page's member card
  // (subscriptionStatusCopy.ts) so the two cannot drift. A cancelled
  // subscription still MANAGES from here — the store page is where
  // auto-renew is turned back on — under a Resubscribe label.
  const {
    title,
    detail: statusLabel,
    action,
  } = describePlanStatus({
    tier,
    isInTrial,
    trialKind,
    trialEndsAt,
    trialDaysLeft,
    autoRenew,
    renewsAt: profile?.subscriptionExpiresAt,
    planId: planForProductId(profile?.appleProductId),
  });

  const handleRow = async () => {
    haptic();
    if (action === "offer") {
      navigate("/upgrade?from=settings");
      return;
    }
    if (!user || manageLoading) return;
    setManageLoading(true);
    const result = await manageSubscription(user.uid);
    if (!result.success && result.error) toast.error(result.error);
    setManageLoading(false);
  };

  return (
    <SettingsSection
      title="Subscription"
      subtitle="Plan, billing, AI usage"
      section="subscription"
    >
      <button
        type="button"
        onClick={() => void handleRow()}
        disabled={manageLoading}
        aria-busy={manageLoading}
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-card motion-safe:active:scale-[0.99] disabled:opacity-60"
      >
        <div className="flex items-center gap-3">
          <Crown className="size-5 text-primary" />
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{statusLabel}</p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {action === "manage"
            ? "Manage"
            : action === "resubscribe"
              ? "Resubscribe"
              : null}
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      </button>
      {/*
        F1b lock pin #6 — the daily AI-usage pill. It was built, tested,
        and reached by nothing (#1921), so a locked decision never shipped.

        Here rather than its own hub row: the pill reports how much of the
        Pro scan quota is left and routes free users to /upgrade, so it
        reads as part of the plan rather than a topic of its own. The
        `ai_usage` member of `SettingsSection` (settingsAnalytics.ts) keeps
        it addressable as its own analytics section either way — that union
        having a member with no page anywhere is what made this findable.
      */}
      {/*
        Its own analytics section even though it lives inside this page:
        `ai_usage` is a member of the closed `SettingsSection` union, and
        that union having a member no page reported is what made the
        orphan findable in the first place. Wrapped individually rather
        than folded into `subscription` so the two stay separable.
      */}
      <TrackSettingsSectionView section="ai_usage">
        <AiUsageSection />
      </TrackSettingsSectionView>
    </SettingsSection>
  );
}
