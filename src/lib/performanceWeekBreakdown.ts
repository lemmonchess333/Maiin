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
import { liftUnitLabel, liftVolumeIn, type LiftUnit } from "./liftLoad";
import type { Baseline, WeeklyAggregates } from "./performanceTypes";
import {
  distanceIn,
  distanceUnitLabel,
  type DistanceUnit,
} from "./distanceUnits";
import { abbreviateK } from "@/utils/formatters";
import { plannedSessionCount } from "./performanceEngine";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "./dateHelpers";

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
  /** "4 sessions", "3 sessions · 1 circuit", "3 runs · longest 14.2 km",
   *  "No runs in these 7 days". */
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

/**
 * How far over the usual week a sport has to be to count as more: the
 * engine's own margin. `computeSignals` (functions/performanceEngine.js)
 * calls a sport ahead of its usual week only above 1.05, and the lines'
 * "18% above your usual week" are read from those signals.
 */
export const MORE_THAN_USUAL_RATIO = 1.05;

/**
 * Whether these 7 days hold more training than the usual week: more
 * kilos lifted or kilometres run than usual in at least one, and less in
 * neither, of the sports you usually do. The figures are the engine's own
 * ratio inputs (`liftProgression`, `runVolume` are this week's over the
 * baseline's), read from `aggregates` and `baseline` rather than those
 * ratios because the app reads a stored 0, a sport dropped for the week,
 * as 1 (`normalisePerformanceDoc`).
 *
 * More is more by the engine's margin (`MORE_THAN_USUAL_RATIO`), not by
 * any amount. The stored kilometres are rounded to 0.1 and the usual
 * week's are not, so 20.0 km against a usual 19.975 drew "20.0 km" beside
 * "20.0 km" on the bars and still read as more. Less is any amount: a
 * claim of more is the one this can get wrong, so it stays strict there.
 *
 * The band is no evidence of it: it bands the whole score, and a week at
 * the usual one with recovery and food on track scores in the high band
 * (`trainedMoreThanUsual.test.ts`). So "You trained more than your usual
 * week" is said on this alone. A sport you don't usually do weighs
 * neither way, and with no usual week the bars would draw (under
 * `USUAL_WEEK_MIN_WEEKS` of it) nothing is claimed.
 */
export function trainedMoreThanUsual(doc: {
  aggregates?: Partial<WeeklyAggregates> | null;
  baseline?: Partial<Baseline> | null;
}): boolean {
  const agg = doc.aggregates ?? {};
  const base = doc.baseline ?? {};
  if (num(base.weeksUsed) < USUAL_WEEK_MIN_WEEKS) return false;
  const pairs = [
    [num(agg.liftTonnage), num(base.liftTonnage)],
    [num(agg.runKm), num(base.runKm)],
  ].filter(([, usual]) => usual > 0);
  return (
    pairs.some(([done, usual]) => done / usual > MORE_THAN_USUAL_RATIO) &&
    pairs.every(([done, usual]) => done >= usual)
  );
}

/** The 7 days' sessions against the plan's week. */
export interface WindowSessions {
  /** Lifts, runs and circuits saved in the 7 days, as adherence counts
   *  them (`computeAdherenceScore`). */
  done: number;
  /** The sessions the plan holds a week (`plannedForWindow`). */
  planned: number;
  /** The score counted the food: logged on 3 days or more, with
   *  something in it (`computeAdherenceScore`'s own condition). */
  foodCounted: boolean;
}

/**
 * The sessions done in the score's 7 days against the sessions planned a
 * week, the two figures the score's adherence divides.
 *
 * The done count is the document's own, for exactly its window. Not the
 * training week (`trainingWeek.ts`): that is Monday to Sunday, and the
 * score's window is the 7 days ending on its compute date, so midweek the
 * week's count is always short of its plan. Seven days in a row hold each
 * weekday once, so a week's plan is the window's.
 *
 * Null when the plan's count is not known (`plannedForWindow`) or the
 * document carries no session counts.
 */
export function sessionsAgainstPlan(
  doc: { aggregates?: Partial<WeeklyAggregates> | null },
  planned: number | null | undefined
): WindowSessions | null {
  const agg = doc.aggregates;
  if (!agg || !planned || planned <= 0) return null;
  if (
    typeof agg.liftSessions !== "number" &&
    typeof agg.runSessions !== "number"
  )
    return null;
  return {
    done:
      num(agg.liftSessions) + num(agg.runSessions) + num(agg.circuitSessions),
    planned,
    foodCounted:
      num(agg.mealDaysLogged) >= 3 &&
      (num(agg.avgDailyCalories) > 0 || num(agg.avgDailyProtein) > 0),
  };
}

/** What the lead knows of the plan (History reads it). */
export interface LeadPlan {
  /** The profile's sessions a week (`plannedSessionCount`): what the
   *  score's adherence divided by. 0 when nothing is planned. */
  perWeek: number;
  /** This Monday to Sunday's planned sessions as `trainingWeek` counts
   *  them, Home's and Train's count; null until the week has loaded. */
  thisWeek: number | null;
  /** The race the plan builds to, "yyyy-MM-dd", or null. */
  raceDate: string | null;
}

/** The plan's count for a week, as `trainingWeek` and the week pulse give
 *  it: a lane with nothing planned counts none. */
interface PlannedWeek {
  lifts: { planned: number | null } | null;
  runs: { planned: number | null } | null;
}

export function leadPlan(
  profile:
    | (Parameters<typeof plannedSessionCount>[0] & {
        raceGoal?: { targetDate?: string } | null;
      })
    | null
    | undefined,
  week: PlannedWeek | null | undefined
): LeadPlan {
  return {
    perWeek: plannedSessionCount(profile ?? {}),
    thisWeek: week
      ? (week.lifts?.planned ?? 0) + (week.runs?.planned ?? 0)
      : null,
    raceDate: profile?.raceGoal?.targetDate || null,
  };
}

/**
 * The planned count the lead may say for the 7 days ending on
 * `windowEnd`, or null when it can't be sure the plan held it.
 *
 * The score divides by the profile's days a week, but the app does not
 * always plan them, and "3 of 5 planned" beside Home's "3 of 3" says two
 * things about one week. So a count is said only when:
 *
 *   - the window ends today or yesterday ("Last 7 days"): the plan read
 *     now is the plan of a window that ends now, not of an older one;
 *   - this week as Home and Train count it holds the profile's count.
 *     Race week rests lifts (`liftsAsked`), a free runner's week plans no
 *     runs (Run9a), and a race plan's week holds its own run days;
 *   - the window touches none of a race's last weeks: the three before
 *     the race's week (a marathon's run taper is three), its week and the
 *     one after (`raceLiftWeek`). This week can match while the window
 *     still holds days of race week, on the Monday after it.
 */
export function plannedForWindow(
  plan: LeadPlan | null | undefined,
  windowEnd: string,
  today: Date
): number | null {
  if (!plan || plan.perWeek <= 0 || plan.thisWeek === null) return null;
  // yyyy-MM-dd keys compare in date order.
  if (windowEnd < localDateString(addLocalDays(today, -1))) return null;
  if (plan.thisWeek !== plan.perWeek) return null;
  if (plan.raceDate) {
    const raceMonday = parseLocalDate(
      localWeekKey(parseLocalDate(plan.raceDate))
    );
    const firstDay = localDateString(addLocalDays(raceMonday, -21));
    const lastDay = localDateString(addLocalDays(raceMonday, 13));
    const windowStart = localDateString(
      addLocalDays(parseLocalDate(windowEnd), -6)
    );
    if (windowStart <= lastDay && windowEnd >= firstDay) return null;
  }
  return plan.perWeek;
}

/** What the lead's line is told beside the engine's signals (`getLine`). */
export function leadEvidence(
  doc: {
    weekKey?: string;
    aggregates?: Partial<WeeklyAggregates> | null;
    baseline?: Partial<Baseline> | null;
  },
  plan: LeadPlan | null | undefined,
  today: Date
): { trainedMore: boolean; sessions: WindowSessions | null } {
  return {
    trainedMore: trainedMoreThanUsual(doc),
    sessions: doc.weekKey
      ? sessionsAgainstPlan(doc, plannedForWindow(plan, doc.weekKey, today))
      : null,
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function tonnageText(kg: number, unit: LiftUnit): string {
  return `${abbreviateK(liftVolumeIn(kg, unit))} ${liftUnitLabel(unit)}`;
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
    /** The lifter's unit for the tonnage's words; the figures stay kg. */
    liftUnit: LiftUnit;
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
  // Circuits (Circ1) are a way of lifting that counts for adherence and
  // never for the tonnage: said beside the sessions, so a score raised by
  // a circuit has its reason on the page.
  const circuits = num(agg.circuitSessions);
  const tonnage = num(agg.liftTonnage);
  const usualTonnage = comparable ? num(base.liftTonnage) : 0;
  // A discipline the user does not train says nothing; one they usually
  // train and skipped this week says so, against the usual week.
  if (liftSessions > 0 || usualTonnage > 0 || circuits > 0) {
    const sessionsText =
      liftSessions > 0
        ? plural(liftSessions, "session", "sessions")
        : circuits > 0
          ? null
          : "No lifting in these 7 days";
    const circuitsText =
      circuits > 0 ? plural(circuits, "circuit", "circuits") : null;
    measures.push({
      key: "lifting",
      label: "Lifting",
      value: tonnage,
      valueText: tonnageText(tonnage, options.liftUnit),
      usual: usualTonnage > 0 ? usualTonnage : null,
      usualText:
        usualTonnage > 0 ? tonnageText(usualTonnage, options.liftUnit) : null,
      detail: [sessionsText, circuitsText].filter(Boolean).join(" · "),
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
