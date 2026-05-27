import { ResponsiveContainer, AreaChart, Area } from "recharts";

/**
 * Direction tells us which way is "good" so the delta chip can colour
 * itself goal-aware instead of red-on-decrease / green-on-increase by
 * default. Examples:
 *   "up-good"   — lifting volume, sessions, protein (more is better)
 *   "down-good" — average calories on a cut, weight on a cut
 *   "neutral"   — calories on maintenance, carbs/fat without goal context
 *                 (just shows the change, not a sentiment)
 */
type Direction = "up-good" | "down-good" | "neutral";

interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  delta?: { value: string; positive: boolean } | null;
  /** Sentiment direction for the delta chip. Defaults to "up-good". */
  direction?: Direction;
  /** Optional small line under the delta, e.g. "target 180g". */
  target?: string;
  sparklineData?: number[];
  accentColor?: string;
  onClick?: () => void;
}

export default function StatCard({
  label,
  value,
  unit,
  delta,
  direction = "up-good",
  target,
  sparklineData,
  accentColor = "#7B72E9",
  onClick,
}: StatCardProps) {
  const gradientId = `spark-${label.replace(/\s/g, "-")}`;

  // Resolve delta sentiment from the direction prop. "neutral" always
  // greys the chip; otherwise good/bad maps to emerald/red.
  const sentiment: "good" | "bad" | "neutral" = !delta
    ? "neutral"
    : direction === "neutral"
      ? "neutral"
      : delta.positive === (direction === "up-good")
        ? "good"
        : "bad";
  const deltaColor =
    sentiment === "good"
      ? "text-emerald-500"
      : sentiment === "bad"
        ? "text-red-400"
        : "text-muted-foreground";

  const showSparkline = !!sparklineData && sparklineData.length > 2;

  return (
    <button
      type="button"
      onClick={onClick}
      className="p-4 rounded-2xl bg-card text-left w-full active:scale-[0.98]"
      style={{ boxShadow: "var(--ds-shadow-card)" }}
    >
      <p className="text-xs uppercase tracking-wider font-medium mb-2 text-muted-foreground">
        {label}
      </p>

      {/* Value + unit on their own full-width row. Side-by-side layout
          with the sparkline doesn't fit on phone-sized stat cards once
          the value is more than 3 digits — "2,143 kcal/day" plus a 64px
          sparkline overflows the ~152px content area. Stacking the
          sparkline below as a thin full-width band gives every realistic
          value enough room without truncation. */}
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-extrabold font-mono tabular-nums text-foreground leading-none whitespace-nowrap">
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>

      {showSparkline && (
        // Sparkline is decorative — no tooltip, no active dot, no
        // cursor. The big number above IS the metric. The sparkline
        // is a glance at the shape of the trend, not an interactive
        // chart. `pointerEvents: none` removes the misleading hover
        // affordance.
        <div
          className="w-full h-5 mt-2 -mx-1"
          style={{ pointerEvents: "none" }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={sparklineData!.map((v, i) => ({ v, i }))}
              margin={{ top: 1, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={accentColor}
                    stopOpacity={0.35}
                  />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={accentColor}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {delta && (
        <p
          className={`text-xs mt-1.5 font-medium flex items-center gap-0.5 ${deltaColor}`}
        >
          <span>{delta.positive ? "↑" : "↓"}</span>
          <span>{delta.value} vs last</span>
        </p>
      )}
      {target && (
        <p className="text-[10px] text-muted-foreground/80 mt-0.5 font-mono tabular-nums">
          {target}
        </p>
      )}
    </button>
  );
}
