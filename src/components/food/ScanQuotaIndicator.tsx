interface ScanQuotaIndicatorProps {
  remaining: number;
  resetDate: Date;
  onUpgrade: () => void;
}

function formatResetDate(date: Date): string {
  /* en-GB, like every other dated surface in the app. This was the last
     rendered en-US date left in src/ after the BadgeGrid sweep — it printed
     "Sep 1" in a caption sitting beside surfaces printing "1 Sep". */
  return date.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
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
 * carries that gate, and a "resets {date}" line would be a lie when no
 * scans ever return.
 *
 * States this component still owns:
 *   remaining === 1 → "1 free scan left · resets {date}" — informational
 *                     caption, no action.
 *   remaining === 0 → exhausted copy with the upgrade action (tappable).
 */
export default function ScanQuotaIndicator({
  remaining,
  resetDate,
  onUpgrade,
}: ScanQuotaIndicatorProps) {
  const resetStr = formatResetDate(resetDate);

  if (remaining === 0) {
    return (
      <div className="flex justify-center">
        {/* The hit area is 44px even though the line is 11px. This is a
            real action — it opens the upgrade path — and it had no
            padding and no height of its own, so the tappable box was the
            line box: about 13px. DESIGN_GUIDE §10 sets 44 CSS px for
            "anything interactive" with no exception for a caption that
            happens to be a button.

            The neighbours rule it out being solved the way
            `TrainingForChip` does, with a pseudo-element reaching past
            the visual box: this row sits 6px under the composer input
            and 8px above the meal-slot SegmentedControl, so an extension
            would overlap a 44px radiogroup and make a near-boundary tap
            ambiguous. Growing the box is the honest fix. The line still
            renders as one centred muted caption; it just has room. */}
        <button
          type="button"
          onClick={onUpgrade}
          className="inline-flex items-center justify-center min-h-[44px] px-3 text-caption text-muted-foreground font-medium active:opacity-70 transition-opacity"
        >
          Out of scans — upgrade for unlimited · resets {resetStr}
        </button>
      </div>
    );
  }

  return (
    <p className="text-center text-caption text-muted-foreground">
      1 free scan left · resets {resetStr}
    </p>
  );
}
