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
    <SettingsSection title="Subscription" subtitle="Plan, billing">
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
    </SettingsSection>
  );
}
