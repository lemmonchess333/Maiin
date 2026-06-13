/**
 * Circular progress ring for badge surfaces — the goal-gradient arc drawn
 * around a badge hex. Shared by BadgeGrid's "Next badge" hero and the Home
 * NextBadgeCard so the two never drift in stroke / sweep behaviour.
 *
 * Pure presentational: `pct` is 0..1 (clamped to 1 here so an over-100%
 * progress can't overshoot the arc). Rotated -90° so the sweep starts at
 * 12 o'clock; `aria-hidden` because the textual "X / Y" label carries the
 * value for assistive tech.
 */
export function ProgressRing({
  pct,
  color,
  size = 96,
  strokeWidth = 3,
}: {
  pct: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const r = size / 2 - strokeWidth - 1;
  const circ = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`${color}26`}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circ * Math.min(pct, 1)} ${circ}`}
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}
