import { ResponsiveContainer, AreaChart, Area } from 'recharts';

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
  label, value, unit, delta, direction = "up-good", target, sparklineData, accentColor = '#7B72E9', onClick,
}: StatCardProps) {
  const gradientId = `spark-${label.replace(/\s/g, '-')}`;

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

  return (
    <button onClick={onClick}
      className="p-4 rounded-2xl bg-card text-left w-full active:scale-[0.98]"
      style={{ boxShadow: "var(--ds-shadow-card)" }}>
      <p className="text-xs uppercase tracking-wider font-medium mb-2 text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-foreground leading-none">{value}</span>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
          {delta && (
            <p className={`text-xs mt-1 font-medium flex items-center gap-0.5 ${deltaColor}`}>
              <span>{delta.positive ? '↑' : '↓'}</span>
              <span>{delta.value} vs last</span>
            </p>
          )}
          {target && (
            <p className="text-[10px] text-muted-foreground/80 mt-0.5 font-mono tabular-nums">
              {target}
            </p>
          )}
        </div>
        {sparklineData && sparklineData.length > 2 && (
          <div className="w-16 h-9 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData.map((v, i) => ({ v, i }))}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={accentColor} strokeWidth={1.5}
                  fill={`url(#${gradientId})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </button>
  );
}