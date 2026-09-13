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
import { formatDayMonth } from "@/utils/formatters";
import { getPlan, type PlanId } from "@/lib/proPlans";
import { manageSubscription, planForProductId } from "@/lib/purchaseProvider";
import SettingsSection from "@/components/settings/SettingsSection";
import AiUsageSection from "@/components/settings/AiUsageSection";
import TrackSettingsSectionView from "@/components/settings/TrackSettingsSectionView";

/** "then £3.99/mo" for a known plan, or nothing. */
function priceTail(planId: PlanId | null): string {
  if (!planId) return "";
  const plan = getPlan(planId);
  return `, then ${plan.price}/${plan.shortPeriod}`;
}

function dateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatDayMonth(d);
}

export default function SettingsSubscription() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isInTrial, trialDaysLeft, tier, trialKind, trialEndsAt, autoRenew } =
    useSubscription();
  const [manageLoading, setManageLoading] = useState(false);

  const planId = planForProductId(profile?.appleProductId);
  const billedTrial = tier === "pro" && trialKind === "billed";
  const trialEnd = dateOf(trialEndsAt);
  const renews = dateOf(profile?.subscriptionExpiresAt);

  // Auto-renew off: access runs to the date and stops. The row still
  // manages (the store's subscriptions page is where it is turned back
  // on), but reads "won't renew" and offers Resubscribe — never "unless
  // you cancel" to someone who has.
  const cancelled = autoRenew === false;

  let title: string;
  let statusLabel: string;
  let action: "manage" | "resubscribe" | "offer";
  if (billedTrial) {
    title = "Free trial";
    if (cancelled) {
      statusLabel = trialEnd
        ? `Ends ${trialEnd} · won't renew`
        : `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left · won't renew`;
      action = "resubscribe";
    } else {
      statusLabel = trialEnd
        ? `Ends ${trialEnd}${priceTail(planId)} unless you cancel`
        : `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left${priceTail(planId)}`;
      action = "manage";
    }
  } else if (tier === "pro") {
    title = "Pro";
    if (cancelled) {
      statusLabel = renews ? `Ends ${renews} · won't renew` : "Won't renew";
      action = "resubscribe";
    } else {
      statusLabel = renews ? `Renews ${renews}` : "Full access";
      action = "manage";
    }
  } else if (isInTrial) {
    title = "Pro trial";
    statusLabel = `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left`;
    action = "offer";
  } else {
    title = "Upgrade to Pro";
    statusLabel = "Free — Upgrade for full access";
    action = "offer";
  }

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
