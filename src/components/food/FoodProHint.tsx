import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, X } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { haptic } from "@/lib/haptic";
import { readString, writeString } from "@/lib/localStore";
import { track } from "@/lib/paywallAnalytics";
import { useProCtaLabel } from "@/hooks/useProCtaLabel";

/**
 * FoodProHint — one quiet line under the composer that says photo
 * logging is part of Pro, and where Pro is.
 *
 * This replaces FoodProStrip: a muted card with a filled purple button,
 * rendered ABOVE the composer for every post-trial free user, saying
 * "Photo logging is a Pro feature · Your free trial has ended". The
 * scanner carries the gate itself (a free account's Scan opens it on
 * Barcode, and its photo tabs show the Pro offer), so the strip was the
 * same message twice, and the louder copy — and it pushed the page's
 * primary action, the composer, into the lower half of the screen.
 * Owner call from the Food options page: the gate carries it.
 *
 * So: a text-micro line, a lock glyph, the link, and a dismiss that
 * persists on this device. No "your trial has ended" — the observation
 * is true and the register is a shame-nag; the house voice states what
 * is, not what was missed. The gate itself (tier, unlimited, loading)
 * is the strip's unchanged contract, so a consumable quota that merely
 * ran low is still the quota caption's business, never this line's.
 *
 * Dismissal is a DEVICE preference, like the calorie ring's mode: it
 * is not a fact about the account, and a shared phone sharing it costs
 * nothing.
 */
const DISMISSED_KEY = "tropos.food.proHintDismissed";

interface Props {
  /** The image-AI cap for the user's tier. 0 = Pro-only for this tier. */
  limit: number;
  isUnlimited: boolean;
  loading: boolean;
}

export default function FoodProHint({ limit, isUnlimited, loading }: Props) {
  const navigate = useNavigate();
  const ctaLabel = useProCtaLabel();
  const [dismissed, setDismissed] = useState(
    () => readString(DISMISSED_KEY) === "1"
  );
  if (loading || isUnlimited || limit !== 0 || dismissed) return null;

  return (
    <div
      role="note"
      className="mt-1.5 flex items-center gap-1.5 px-1 text-micro text-muted-foreground"
    >
      <Lock className="size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        Photo logging is part of Pro
      </span>
      <button
        type="button"
        onClick={() => {
          haptic();
          track("paywall_cta_clicked", {
            source: "food_page",
            featureKey: "ai_food_logging",
            platform: "web",
          });
          navigate("/upgrade?from=food");
        }}
        className="min-h-11 px-1 font-semibold text-lifting-strong active:scale-[0.97] transition-transform"
      >
        {ctaLabel}
      </button>
      <IconButton
        aria-label="Dismiss"
        onClick={() => {
          haptic("light");
          writeString(DISMISSED_KEY, "1");
          setDismissed(true);
        }}
        className="-mr-2"
        icon={<X className="size-3.5" />}
      />
    </div>
  );
}
