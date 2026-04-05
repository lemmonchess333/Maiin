interface ScanQuotaIndicatorProps {
  remaining: number;
  resetDate: Date;
  onUpgrade: () => void;
}

function formatResetDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Three-stage scan quota indicator for free users.
 * Stage 1 (4–10 remaining): renders nothing.
 * Stage 2 (1–3 remaining): amber warning pill with reset date.
 * Stage 3 (0 remaining): muted "out of scans" text with upgrade link.
 */
export default function ScanQuotaIndicator({ remaining, resetDate, onUpgrade }: ScanQuotaIndicatorProps) {
  // Stage 1 — silent
  if (remaining > 3) return null;

  const resetStr = formatResetDate(resetDate);

  // Stage 3 — out of scans
  if (remaining === 0) {
    return (
      <div className="flex justify-center">
        <button
          onClick={onUpgrade}
          className="text-xs text-gray-500 font-medium active:opacity-70 transition-opacity"
        >
          Out of scans — upgrade for unlimited
        </button>
      </div>
    );
  }

  // Stage 2 — gentle warning (1–3 remaining)
  const label = remaining === 1
    ? `1 scan left — resets ${resetStr}`
    : `${remaining} scans left — resets ${resetStr}`;

  return (
    <div className="flex justify-center">
      <button
        onClick={onUpgrade}
        className="text-xs font-medium px-3 py-1.5 rounded-full active:opacity-70 transition-opacity"
        style={{
          backgroundColor: "rgb(245 158 11 / 0.1)",
          border: "1px solid rgb(245 158 11 / 0.25)",
          color: "#B45309",
        }}
      >
        {label}
      </button>
    </div>
  );
}
