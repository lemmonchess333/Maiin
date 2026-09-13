import { useNavigate } from "react-router-dom";
import { Camera } from "lucide-react";
import Card from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { track } from "@/lib/paywallAnalytics";
import { hasLapsedOnboardingTrial } from "@/lib/subscription";

/**
 * FoodProStrip — says why the camera is locked, and where Pro is.
 *
 * When a free user's trial ends, the only sign on the Food page was a
 * lock badge on the camera icon. Tapping it opens the contextual sheet,
 * but nothing on the page says what changed or that Pro exists — the
 * owner's own reading of that state was "I need a CTA to the premium
 * page". This is that CTA, one compact row above the composer, rendered
 * only while photo logging is gated for this tier (`limit === 0`):
 * never for Pro or trial users, and never for a consumable quota that
 * merely ran low (the quota caption under the input owns that).
 *
 * Copy is the house register: what changed, what still works, where Pro
 * is. No exclamation marks, no "unlock".
 */
interface Props {
  /** The image-AI cap for the user's tier. 0 = Pro-only for this tier. */
  limit: number;
  isUnlimited: boolean;
  loading: boolean;
}

export default function FoodProStrip({ limit, isUnlimited, loading }: Props) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  if (loading || isUnlimited || limit !== 0) return null;

  // One trial per account: a lapsed onboarding free week counts as the
  // trial even on a profile stamped before the server recorded it.
  const trialUsed =
    !!profile?.hasUsedTrial || hasLapsedOnboardingTrial(profile);

  return (
    <Card size="compact" tone="muted" className="flex items-center gap-3">
      <span
        className="size-9 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: `${THEME.semantic.nutrition}1A`,
          color: THEME.semantic.nutrition,
        }}
        aria-hidden="true"
      >
        <Camera className="size-4" strokeWidth={2} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">
          Photo logging is a Pro feature
        </p>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5">
          {trialUsed
            ? "Your free trial has ended. Typing and search still work."
            : "Snap the plate, get the macros. Typing and search are free."}
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        className="shrink-0 font-bold"
        onClick={() => {
          haptic();
          track("paywall_cta_clicked", {
            source: "food_page",
            featureKey: "ai_food_logging",
            platform: "web",
          });
          navigate("/upgrade?from=food");
        }}
      >
        {trialUsed ? "See Pro" : "Try Pro free"}
      </Button>
    </Card>
  );
}
