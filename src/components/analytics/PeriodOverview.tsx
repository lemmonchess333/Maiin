import { THEME } from "@/lib/theme";
import SectionLabel from "@/components/ui/SectionLabel";
import { Footprints, Dumbbell, UtensilsCrossed } from "lucide-react";
import { formatVolumeSub } from "@/utils/formatters";

interface PeriodOverviewProps {
  runCount: number;
  runDistance: number;
  liftCount: number;
  liftVolume: number;
  /** Average daily calories from logged meals — surfaced under the
   *  Nutrition icon so the sub-line is nutrition-relevant rather than
   *  showing the burn estimate (which lived under nutrition by accident
   *  and read as "calories eaten"). */
  avgCalories: number;
  nutritionAdherence: number;
  timeRange?: string;
  /** Range size in days, used to scale ring targets with timeframe so
   *  the rings don't always max out beyond 1W. */
  rangeDays: number;
}

function Ring({
  value,
  max,
  color,
  size = 44,
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
}) {
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / Math.max(max, 1), 1);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`${color}33`}
        strokeWidth="4"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${circ * pct} ${circ}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Hist5c pin 2 — renamed from WeeklyOverview. Hero is used at every
 * TimeRange (1W → 1Y), not just "this week". The `rangeLabel`
 * already derives from timeRange below — only the component name
 * is changing here. Future PRs may also fold in the 4th ring
 * (Performance Index compact strip) per Hist5b's Performance fold.
 */
export default function PeriodOverview({
  runCount,
  runDistance,
  liftCount,
  liftVolume,
  avgCalories,
  nutritionAdherence,
  timeRange,
  rangeDays,
}: PeriodOverviewProps) {
  const rangeLabel =
    timeRange === "1W"
      ? "This Week"
      : timeRange === "1M"
        ? "This Month"
        : timeRange === "3M"
          ? "Last 3 Months"
          : timeRange === "6M"
            ? "Last 6 Months"
            : timeRange === "1Y"
              ? "This Year"
              : "This Week";

  // Targets prorated from a 5/week aspirational rate. Keeping the ring
  // hardcoded at max=5 meant any range longer than 1W maxed out the
  // ring on the first ~5 sessions/runs and stayed full for the rest of
  // the period — a meaningless visualisation. Scaling with rangeDays
  // gives the ring a real proportional fill at every range.
  const sessionsTarget = Math.max(1, Math.round(5 * (rangeDays / 7)));
  const runsTarget = Math.max(1, Math.round(5 * (rangeDays / 7)));

  const stats = [
    {
      icon: <Footprints className="size-4 text-running" />,
      label: "Runs",
      value: runCount,
      sub: runDistance > 0 ? `${runDistance.toFixed(1)} km` : "—",
      color: THEME.running,
      ringVal: runCount,
      ringMax: runsTarget,
    },
    {
      icon: <Dumbbell className="size-4 text-lifting" />,
      label: "Sessions",
      value: liftCount,
      sub: formatVolumeSub(liftVolume),
      color: THEME.lifting,
      ringVal: liftCount,
      ringMax: sessionsTarget,
    },
    {
      icon: (
        <UtensilsCrossed
          className="size-4"
          style={{ color: THEME.semantic.nutrition }}
        />
      ),
      label: "Adherence",
      value: `${nutritionAdherence}%`,
      sub: avgCalories > 0 ? `${avgCalories.toLocaleString()} kcal/day` : "—",
      color: THEME.semantic.nutrition,
      ringVal: nutritionAdherence,
      ringMax: 100,
    },
  ];

  return (
    <div className="p-4 rounded-2xl bg-card">
      <SectionLabel className="mb-4">{rangeLabel}</SectionLabel>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => {
          const isEmpty = s.ringVal === 0;
          return (
            <div
              key={s.label}
              className="flex flex-col items-center gap-2"
              style={isEmpty ? { opacity: 0.4 } : undefined}
            >
              <div className="relative">
                <Ring value={s.ringVal} max={s.ringMax} color={s.color} />
                <div className="absolute inset-0 flex items-center justify-center">
                  {s.icon}
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold font-mono tabular-nums text-foreground leading-none">
                  {s.value}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
