/**
 * What went into a Performance score, in the numbers the document already
 * holds: the seven days' lifting and running against the user's usual
 * week, and the food logged.
 *
 * The Performance page explained its score with the server's insight
 * bullets, which were templates: "…solid hybrid output", "…great
 * progression", "Consistent week. Keep the rhythm going." One claimed
 * "sleep is the biggest lever" to a user whose recovery score has no sleep
 * input at all. Every document carries the figures those templates were
 * chosen from (`aggregates`, and `baseline` for the usual week), so the
 * page can say what happened instead of how to feel about it.
 *
 * "Usual week" is the engine's baseline: the average of the ACTIVE weeks
 * in the 28 days before the window, so rest weeks do not drag it down. It
 * is only offered once two such weeks exist, and never while the score is
 * still establishing its baseline.
 */
import type { Baseline, WeeklyAggregates } from "./performanceTypes";
import {
  distanceIn,
  distanceUnitLabel,
  type DistanceUnit,
} from "./distanceUnits";
import { abbreviateK } from "@/utils/formatters";

/** Active weeks the baseline needs before it is anyone's usual week. */
export const USUAL_WEEK_MIN_WEEKS = 2;

export interface WeekMeasure {
  key: "lifting" | "running";
  label: string;
  /** This window's figure, in display units (kg, or km / mi). */
  value: number;
  /** "16.2k kg", "32.4 km". */
  valueText: string;
  /** The usual week in the same units, or null when there is none yet. */
  usual: number | null;
  usualText: string | null;
  /** "4 sessions", "3 runs · longest 14.2 km", "No runs in these 7 days". */
  detail: string;
}

export interface WeekFood {
  daysLogged: number;
  /** Average kilocalories across the days logged. */
  caloriesPerDay: number;
  /** Average grams of protein across the days logged. */
  proteinPerDay: number;
}

export interface WeekBreakdown {
  measures: WeekMeasure[];
  food: WeekFood | null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function kgText(kg: number): string {
  return `${abbreviateK(kg)} kg`;
}

function distanceText(km: number, unit: DistanceUnit): string {
  return `${distanceIn(km * 1000, unit).toFixed(1)} ${distanceUnitLabel(unit)}`;
}

export function performanceWeekBreakdown(
  doc: {
    aggregates?: Partial<WeeklyAggregates> | null;
    baseline?: Partial<Baseline> | null;
  },
  options: {
    distanceUnit: DistanceUnit;
    /** The score is still establishing: no usual week to compare with. */
    establishing: boolean;
  }
): WeekBreakdown {
  const agg = doc.aggregates ?? {};
  const base = doc.baseline ?? {};
  const comparable =
    !options.establishing && num(base.weeksUsed) >= USUAL_WEEK_MIN_WEEKS;
  const unit = options.distanceUnit;
  const measures: WeekMeasure[] = [];

  const liftSessions = num(agg.liftSessions);
  const tonnage = num(agg.liftTonnage);
  const usualTonnage = comparable ? num(base.liftTonnage) : 0;
  // A discipline the user does not train says nothing; one they usually
  // train and skipped this week says so, against the usual week.
  if (liftSessions > 0 || usualTonnage > 0) {
    measures.push({
      key: "lifting",
      label: "Lifting",
      value: tonnage,
      valueText: kgText(tonnage),
      usual: usualTonnage > 0 ? usualTonnage : null,
      usualText: usualTonnage > 0 ? kgText(usualTonnage) : null,
      detail:
        liftSessions > 0
          ? plural(liftSessions, "session", "sessions")
          : "No lifting in these 7 days",
    });
  }

  const runSessions = num(agg.runSessions);
  const runKm = num(agg.runKm);
  const longestKm = num(agg.runLongKm);
  const usualKm = comparable ? num(base.runKm) : 0;
  if (runSessions > 0 || usualKm > 0) {
    const runs = plural(runSessions, "run", "runs");
    measures.push({
      key: "running",
      label: "Running",
      value: distanceIn(runKm * 1000, unit),
      valueText: distanceText(runKm, unit),
      usual: usualKm > 0 ? distanceIn(usualKm * 1000, unit) : null,
      usualText: usualKm > 0 ? distanceText(usualKm, unit) : null,
      detail:
        runSessions === 0
          ? "No runs in these 7 days"
          : longestKm > 0 && runSessions > 1
            ? `${runs} · longest ${distanceText(longestKm, unit)}`
            : runs,
    });
  }

  const daysLogged = Math.min(7, num(agg.mealDaysLogged));
  const food: WeekFood | null =
    daysLogged > 0
      ? {
          daysLogged,
          caloriesPerDay: Math.round(num(agg.avgDailyCalories)),
          proteinPerDay: Math.round(num(agg.avgDailyProtein)),
        }
      : null;

  return { measures, food };
}
