/**
 * SettingsSubscription — Subscription nested page (Set1.2).
 *
 * Compact landing for plan status + a deeplink to /upgrade. Once
 * Sub1-Sub2 land (Manage subscription / Restore purchases / Pro
 * feature inventory), they slot in here as additional rows without
 * touching the index.
 */
import { useNavigate } from "react-router-dom";
import { Crown, ChevronRight } from "lucide-react";
import { useSubscription } from "@/lib/subscription";
import { haptic } from "@/lib/haptic";
import SettingsSection from "@/components/settings/SettingsSection";
import AiUsageSection from "@/components/settings/AiUsageSection";
import TrackSettingsSectionView from "@/components/settings/TrackSettingsSectionView";

export default function SettingsSubscription() {
  const navigate = useNavigate();
  const { isInTrial, trialDaysLeft, tier } = useSubscription();

  const statusLabel =
    tier === "pro"
      ? "Pro — Full access"
      : isInTrial
        ? `Pro trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left`
        : "Free — Upgrade for full access";

  return (
    <SettingsSection
      title="Subscription"
      subtitle="Plan, billing, AI usage"
      section="subscription"
    >
      <button
        type="button"
        onClick={() => {
          haptic();
          navigate("/upgrade");
        }}
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-card motion-safe:active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <Crown className="size-5 text-primary" />
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">
              {tier === "pro"
                ? "Pro"
                : isInTrial
                  ? "Pro trial"
                  : "Upgrade to Pro"}
            </p>
            <p className="text-xs text-muted-foreground">{statusLabel}</p>
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
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
