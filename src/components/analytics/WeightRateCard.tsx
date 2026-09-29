import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import type { WeightTrendPoint } from "@/hooks/useBodyweightTrend";
import { parseLocalDate } from "@/lib/dateHelpers";
import { kgToLb } from "@/lib/weightUnits";
import {
  currentWeightRate,
  RATE_WINDOW_DAYS,
  STEADY_RATE_KG,
  weeklyWeightAverages,
} from "@/utils/weightTrend";
import { formatDayMonth } from "@/utils/formatters";

type WeightUnit = "kg" | "lbs";

/** A signed figure in the reader's unit: "−0.33", "+0.20", "0.00". The
 *  minus is the typographic one, which a screen reader says as "minus". */
function signed(kg: number, unit: WeightUnit, decimals: number): string {
  const v = unit === "lbs" ? kgToLb(kg) : kg;
  const text = Math.abs(v).toFixed(decimals);
  if (Number(text) === 0) return (0).toFixed(decimals);
  return `${v < 0 ? "−" : "+"}${text}`;
}

/** How the rate stands against the target, in plain words, or null
 *  without a target to compare with. `recent` is whether the rate is the
 *  last four weeks': one taken across a gap in weighing says nothing about
 *  now, so it cannot say the weight is holding for now. */
function comparison(
  rateKg: number,
  targetKg: number | null,
  recent: boolean
): string | null {
  if (targetKg === null) return null;
  if (Math.abs(rateKg) < STEADY_RATE_KG)
    return recent ? "Holding steady for now." : "Holding steady.";
  if (Math.sign(rateKg) !== Math.sign(targetKg))
    return "Moving the other way from your target.";
  if (Math.abs(rateKg - targetKg) <= STEADY_RATE_KG) return "On your target.";
  return Math.abs(rateKg) < Math.abs(targetKg)
    ? "Slower than your target."
    : "Faster than your target.";
}

/**
 * The Body page's rate (DS3): how fast the trend weight is moving now,
 * against the rate the user set, and the weekly averages behind it.
 *
 * The weight chart drew the line and a goal date, but not the one number
 * a cut or a bulk is run by: kilograms a week. It is read over the last
 * four weeks of the trend (`recentWeeklyRate`), the same rate the chart's
 * "at this rate" date now uses, so the two cannot disagree. The target is
 * the user's own, and only when their phase agrees with its sign
 * (`attestedWeeklyRateKg`); a maintainer sees the rate alone.
 *
 * Weekly averages are the figure a daily weigher and a weekly one can
 * both compare: one morning swings by more than a week's real change.
 *
 * With "Hide the number" on, this card does not render at all: every
 * figure in it is a weight. The chart above keeps its direction-only copy.
 */
export default function WeightRateCard({
  points,
  unit,
  targetKgPerWeek,
  hideNumber,
  today,
}: {
  points: readonly WeightTrendPoint[];
  unit: WeightUnit;
  /** The user's attested weekly rate, signed kg, or null. */
  targetKgPerWeek: number | null;
  hideNumber: boolean;
  today: Date;
}) {
  if (hideNumber || points.length < 2) return null;
  const rate = currentWeightRate(points);
  const weeks = weeklyWeightAverages(points, { today });
  if (!rate && weeks.length === 0) return null;

  const spanWeeks = rate
    ? Math.round(
        (parseLocalDate(rate.toDate).getTime() -
          parseLocalDate(rate.fromDate).getTime()) /
          (7 * 86_400_000)
      )
    : 0;
  /* The rate starts at the latest weigh-in four or more weeks back, which
     after a gap in weighing can be months ago. It is "the last 4 weeks"
     only when it spans about that; otherwise its start is named. */
  const lastWindow =
    rate !== null && spanWeeks === Math.round(RATE_WINDOW_DAYS / 7);
  const rateSpan = lastWindow
    ? `last ${Math.round(RATE_WINDOW_DAYS / 7)} weeks`
    : rate
      ? `since ${formatDayMonth(parseLocalDate(rate.fromDate))}`
      : "";
  const verdict = rate
    ? comparison(rate.kgPerWeek, targetKgPerWeek, lastWindow)
    : null;

  return (
    <Card as="section" aria-label="Your rate" className="space-y-4">
      <div>
        <h2 className="text-h3 font-bold text-foreground">Your rate</h2>
        <p className="text-sm text-muted-foreground">
          From your trend weight, which smooths out day-to-day swings.
        </p>
      </div>

      {rate && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <span className="block whitespace-nowrap text-h2 font-extrabold font-mono tabular-nums leading-tight text-foreground">
                {signed(rate.kgPerWeek, unit, 2)}
              </span>
              <span className="block text-sm text-muted-foreground">
                {unit} a week, {rateSpan}
              </span>
            </div>
            {targetKgPerWeek !== null && (
              <div className="min-w-0">
                <span className="block whitespace-nowrap text-h2 font-extrabold font-mono tabular-nums leading-tight text-foreground">
                  {signed(targetKgPerWeek, unit, 2)}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {unit} a week, your target
                </span>
              </div>
            )}
          </div>
          {verdict && (
            <p className="text-sm font-semibold text-foreground">{verdict}</p>
          )}
        </div>
      )}

      {weeks.length > 0 && (
        <div className="space-y-1">
          <SectionHeading size="compact">Weekly averages</SectionHeading>
          <ul className="divide-y divide-border">
            {weeks.map((w) => {
              const label = w.current
                ? "This week so far"
                : `Week of ${formatDayMonth(parseLocalDate(w.weekKey))}`;
              return (
                <li key={w.weekKey} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        {w.weighIns}
                      </span>{" "}
                      {w.weighIns === 1 ? "weigh-in" : "weigh-ins"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    <span className="font-mono tabular-nums">
                      {(unit === "lbs"
                        ? kgToLb(w.averageKg)
                        : w.averageKg
                      ).toFixed(1)}
                    </span>{" "}
                    <span className="font-normal text-muted-foreground">
                      {unit}
                    </span>
                  </span>
                  <span
                    className="w-12 shrink-0 text-right text-xs font-mono tabular-nums text-muted-foreground"
                    data-testid="week-change"
                  >
                    {w.changeKg === null ? "" : signed(w.changeKg, unit, 1)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
