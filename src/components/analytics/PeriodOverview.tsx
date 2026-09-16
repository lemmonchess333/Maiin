import { THEME } from "@/lib/theme";
import SectionLabel from "@/components/ui/SectionLabel";
import { Footprints, Dumbbell, UtensilsCrossed } from "lucide-react";
import { formatVolumeSub } from "@/utils/formatters";
import { distanceLabel } from "@/lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";

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
  /**
   * The user's own weekly training targets, prorated by the range below.
   * `0` or absent means they have set none — a freeform runner has no run
   * plan, and a run-only athlete has no lift days — and the ring then
   * draws its track with no progress arc rather than inventing a figure
   * to be a fraction of.
   */
  weeklyLiftTarget?: number;
  weeklyRunTarget?: number;
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
  /* `max === 0` is "no target set", which is different from "target not
     yet met" — there is no fraction to draw, so the arc is omitted and
     the track stands alone. The count below the ring still reads. */
  const hasTarget = max > 0;
  const pct = hasTarget ? Math.min(value / max, 1) : 0;
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
      {hasTarget && (
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
      )}
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
  weeklyLiftTarget,
  weeklyRunTarget,
  timeRange,
  rangeDays,
}: PeriodOverviewProps) {
  const unit = useDistanceUnit();
  /* Every range here is a ROLLING window ending today — History derives
     it as `since = today - rangeDays` (7 / 30 / 90 / 180 / 365). Three of
     the five labels named a CALENDAR period instead, which is a different
     span and usually a much smaller one: on 16 September "This Year" sat
     over 16 September 2025 onward, and in January it would head eleven
     months of the previous year. "This week" has the same gap against the
     app's Monday-anchored week — on a Wednesday the trailing seven days
     reach back into last week — and it is the gap `ProgrammeRunSection`
     was already fixed for, where the data could be moved to match the
     claim. Here it cannot: the range control offers durations, so the
     window is the honest thing and the label is what has to give.

     The register was already in this list twice. "Last 3 months" and
     "Last 6 months" name the window and needed nothing. */
  const rangeLabel =
    timeRange === "1W"
      ? "Last 7 days"
      : timeRange === "1M"
        ? "Last 30 days"
        : timeRange === "3M"
          ? "Last 3 months"
          : timeRange === "6M"
            ? "Last 6 months"
            : timeRange === "1Y"
              ? "Last 12 months"
              : "Last 7 days";

  /* The user's OWN weekly targets, prorated across the range — not an
     aspirational 5/week the app picked for them.

     Five was wrong in both directions and quietly. A three-day lifter
     hitting every session read 60% full, so the surface most likely to
     say "you are on plan" told them they were behind; a freeform runner,
     who has no run plan at all, was measured against five runs a week
     they never agreed to. Both numbers are on the profile already —
     `daysPerWeek` is what onboarding asked, and `getWeeklyRunTarget` is
     the canonical run resolver whose default is 0 for exactly this
     reason.

     A target of 0 is a real answer, not a missing one, so the ring shows
     its track and no arc. `Math.max(1, …)` would have turned "no plan"
     into "one per week" and filled the ring on the first session. */
  const proRate = (perWeek: number) =>
    perWeek > 0 ? Math.max(1, Math.round(perWeek * (rangeDays / 7))) : 0;
  const sessionsTarget = proRate(weeklyLiftTarget ?? 0);
  const runsTarget = proRate(weeklyRunTarget ?? 0);

  const stats = [
    {
      icon: <Footprints className="size-4 text-running" />,
      label: "Runs",
      value: runCount,
      /* `runDistance` is KILOMETRES (History sums weekly km), hence the
         ×1000 back to the metres every distance helper takes. */
      sub: runDistance > 0 ? distanceLabel(runDistance * 1000, unit) : "—",
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
              className="min-w-0 flex flex-col items-center gap-2"
            >
              {/* The dimming rides the RING, never the column.
                  `--muted-foreground` is tuned to clear 4.5:1 and nothing
                  more, so ANY alpha over the text drops it under the
                  floor: at 0.4 the label and sub measure 1.76:1 (light) /
                  2.15:1 (dark) and the number above them 2.72:1 / 3.37:1,
                  and even 0.8 only reaches 3.57:1 in light. `isEmpty` is
                  `ringVal === 0`, which every column satisfies at cold
                  start — the state most users meet first. The ring is
                  decoration and the word beneath it carries the meaning,
                  so only the ring dims. Both halves pinned by
                  `PeriodOverview.test.tsx`. */}
              <div
                className="relative"
                style={isEmpty ? { opacity: 0.4 } : undefined}
              >
                <Ring value={s.ringVal} max={s.ringMax} color={s.color} />
                <div className="absolute inset-0 flex items-center justify-center">
                  {s.icon}
                </div>
              </div>
              <div className="min-w-0 w-full text-center">
                <p className="text-xl font-bold font-mono tabular-nums text-foreground leading-none">
                  {s.value}
                </p>
                {/* `label` existed on every stat but was only ever spent
                    as the React key, so the three columns were a number,
                    a ring and an icon — meaning carried by the glyph
                    alone. A shoe, a dumbbell and a flame are not
                    self-evident, and nothing here is announced to a
                    screen reader either. NOT font-mono: this is a word,
                    and that treatment is scoped to numerals. */}
                <p className="text-caption text-muted-foreground mt-1 truncate">
                  {s.label}
                </p>
                {/* Sub-values are free text ("12.4t", "2,143 kcal/day")
                    and the column is a third of a phone card, so it
                    truncates rather than wrapping the row taller. */}
                <p className="text-xs text-muted-foreground mt-0.5 font-mono tabular-nums truncate">
                  {s.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
