import { DAILY_AI_LIMITS } from "@/lib/subscription";
import { formatTimeOfDay } from "@/utils/formatters";

interface ScanQuotaIndicatorProps {
  remaining: number;
  resetDate: Date;
  onUpgrade: () => void;
}

/**
 * Scan quota caption — a single 11px muted line under the composer
 * input row (wave2 B).
 *
 * Renders ONLY when quota is actually scarce; the parent
 * (FoodComposerCard) gates rendering to
 * `!isUnlimited && limit > 0 && remaining <= 1`. There is no standing
 * quota furniture while the user has headroom (remaining > 1 renders
 * nothing — pre-wave2 it was an always-on "[N] scans left this month"
 * footnote), and `limit === 0` (free tier where scanning is Pro-only,
 * not a consumed quota) renders nothing — the locked scan icon already
 * carries that gate, and a "resets at …" line would be a lie when no
 * scans ever return.
 *
 * The reset is a time, not a date: the count starts again at 00:00 UTC
 * (src/lib/scanQuotaDay.ts), which for most people is during their day,
 * so a date would often name today.
 *
 * States this component still owns:
 *   remaining === 1 → "1 free scan left · resets at {HH:mm}" —
 *                     informational caption, no action.
 *   remaining === 0 → exhausted copy with the upgrade action (tappable).
 *                     It names Pro's daily cap, not "unlimited": the
 *                     server stops Pro at DAILY_AI_LIMITS too.
 */
export default function ScanQuotaIndicator({
  remaining,
  resetDate,
  onUpgrade,
}: ScanQuotaIndicatorProps) {
  const resetStr = formatTimeOfDay(resetDate);

  if (remaining === 0) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onUpgrade}
          className="text-caption text-muted-foreground font-medium active:opacity-70 transition-opacity"
        >
          Out of scans · upgrade for {DAILY_AI_LIMITS.pro.image_ai} a day ·
          resets at {resetStr}
        </button>
      </div>
    );
  }

  return (
    <p className="text-center text-caption text-muted-foreground">
      1 free scan left · resets at {resetStr}
    </p>
  );
}
