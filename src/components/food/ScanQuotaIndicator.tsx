interface ScanQuotaIndicatorProps {
  remaining: number;
  resetDate: Date;
  onUpgrade: () => void;
}

function formatResetDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Scan quota indicator for free users — informational helper text
 * directly below the Scan CTA.
 *
 * Pre-F5 the >0 states rendered as a prominent amber pill that
 * competed with the primary "Scan your meal" button visually,
 * even though the user still had scans available. Quota is
 * informational, not warning-level — only the 0-state warrants a
 * call to action.
 *
 * Post-F5 states:
 *   remaining > 0  → muted footnote ("[N] scans left this month").
 *                    No reset date, no pill, no orange, no upgrade
 *                    button. Reads as a footnote, not a feature.
 *   remaining = 0  → muted upgrade prompt ("Out of scans — upgrade
 *                    for unlimited"). Tappable button. Behaviour
 *                    preserved from earlier sprints.
 *
 * Paid / unlimited users: parent gates rendering so this component
 * never sees them — no nullish render needed here.
 */
export default function ScanQuotaIndicator({
  remaining,
  resetDate,
  onUpgrade,
}: ScanQuotaIndicatorProps) {
  // 0 remaining — preserved from earlier behaviour. Muted upgrade
  // CTA + reset date so the user knows when scans return.
  if (remaining === 0) {
    const resetStr = formatResetDate(resetDate);
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onUpgrade}
          className="text-xs text-muted-foreground font-medium active:opacity-70 transition-opacity"
        >
          Out of scans · free scans reset {resetStr}
        </button>
      </div>
    );
  }

  // > 0 remaining — quiet footnote. No upgrade tap; users with
  // scans left can upgrade via Settings if they want preemptive
  // unlimited. The footnote is purely informational.
  const label =
    remaining === 1
      ? "1 scan left this month"
      : `${remaining} scans left this month`;

  return <p className="text-center text-xs text-muted-foreground">{label}</p>;
}
